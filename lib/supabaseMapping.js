import bcrypt from 'bcryptjs';

// Helper to simulate network delay if needed
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sanitizeNamePart(str, take = 3) {
  if (!str) return '';
  const noDiacritics = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lettersOnly = noDiacritics.replace(/[^a-zA-Z]/g, '');
  return lettersOnly.slice(0, take).toLowerCase();
}

function randomFromAlphabet(length, alphabet) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function generateRandomPassword(length = 10) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return randomFromAlphabet(length, alphabet);
}

export const handleSupabaseRequest = async (url, method, body, headers, supabase) => {
  // Normalize URL (remove base if present, though ApiClient passes relative)
  const path = url.replace(/^(http:\/\/[^/]+)?/, '');
  
  // Extract query params
  const [route, queryString] = path.split('?');
  const queryParams = new URLSearchParams(queryString);
  
  // LOGIN
  if (route === '/api/login' && method === 'POST') {
    const { username, password } = body;
    if (!username || !password) {
      throw new Error('Brak nazwy użytkownika lub hasła');
    }
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
      
    if (error || !user) {
      throw new Error('Nieprawidłowa nazwa użytkownika lub hasło');
    }
    
    // Check lockout
    if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
       throw new Error('Konto jest tymczasowo zablokowane. Spróbuj później.');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new Error('Nieprawidłowa nazwa użytkownika lub hasło');
    }

    // Return structure expected by LoginScreen - FLAT OBJECT to match backend/server.js
    // Backend returns: { id, username, role, full_name, ..., token }
    // We generate a fake token for client-side persistence
    // Use global atob/btoa if available, or simple base64
    const b64 = (str) => {
        try { return btoa(str); } catch (e) { return str; } // Fallback if no btoa (should be there in RN)
    };
    
    const token = `supabase-mock-token-${Date.now()}.${b64(JSON.stringify({ id: user.id, username: user.username, role: user.role, exp: Math.floor(Date.now()/1000) + 86400 }))}.sign`;
    
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      email: user.email,
      token
    };
  }

  // LOGOUT (POST)
  if (route === '/api/auth/logout' && method === 'POST') {
    return { message: 'Logged out successfully' };
  }

  // TOOLS SEARCH (GET)
  if (route === '/api/tools/search' && method === 'GET') {
    const code = queryParams.get('code');
    if (!code) throw new Error('Code is required');

    const { data: tools, error } = await supabase
      .from('tools')
      .select('*, tool_issues(id, quantity, status)')
      .or(`sku.eq.${code},barcode.eq.${code},qr_code.eq.${code},inventory_number.eq.${code},name.ilike.%${code}%,serial_number.ilike.%${code}%`);

    if (error) throw new Error(error.message);

    const result = (tools || []).map(tool => {
       const issuedQuantity = (tool.tool_issues || [])
         .filter(i => i.status === 'wydane')
         .reduce((sum, i) => sum + (i.quantity || 0), 0);
       
       const availableQuantity = tool.quantity - issuedQuantity;
       
       const { tool_issues, ...rest } = tool;
       
       return {
         ...rest,
         issued_quantity: issuedQuantity,
         available_quantity: availableQuantity
       };
    });

    return result;
  }

  // TOOLS (GET)
  if (route === '/api/tools' && method === 'GET') {
    let query = supabase.from('tools').select('*', { count: 'exact' });
    
    // Apply filters
    const search = queryParams.get('search');
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,inventory_number.ilike.%${search}%,category.ilike.%${search}%`);
    }
    
    const category = queryParams.get('category');
    if (category) {
      query = query.eq('category', category);
    }
    
    const status = queryParams.get('status');
    if (status) {
      query = query.eq('status', status);
    }
    
    // Pagination
    const page = parseInt(queryParams.get('page') || '1');
    const limit = parseInt(queryParams.get('limit') || '1000');
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    query = query.range(from, to);
    
    // Sorting
    const sortBy = queryParams.get('sortBy');
    const sortDir = queryParams.get('sortDir') === 'desc' ? false : true;
    if (sortBy) {
      // Map frontend sort keys to DB columns if needed, but they seem to match
      query = query.order(sortBy, { ascending: sortDir });
    } else {
      query = query.order('inventory_number', { ascending: true });
    }

    let data, count, error;
    try {
      const result = await query;
      data = result.data;
      count = result.count;
      error = result.error;
    } catch (err) {
      console.error('Supabase query error:', err);
      throw new Error(err.message || 'Connection aborted');
    }

    if (error) throw new Error(error.message);

    return {
      data: data || [],
      pagination: {
        currentPage: page,
        totalPages: Math.ceil((count || 0) / limit),
        totalItems: count || 0,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil((count || 0) / limit),
        hasPreviousPage: page > 1
      }
    };
  }

  // TOOL DETAILS (GET)
  if (route.match(/^\/api\/tools\/\d+$/) && method === 'GET') {
    const toolId = route.split('/').pop();
    
    // Fetch tool and issues
    const { data: tool, error } = await supabase
      .from('tools')
      .select('*, tool_issues(*)')
      .eq('id', toolId)
      .single();
      
    if (error || !tool) throw new Error('Tool not found');

    // Calculate quantities
    const issuedQuantity = (tool.tool_issues || [])
      .filter(i => i.status === 'wydane')
      .reduce((sum, i) => sum + (i.quantity || 0), 0);
      
    const availableQuantity = tool.quantity - issuedQuantity;
    
    // Remove tool_issues from response to match backend structure if needed, 
    // or keep it if frontend expects it. Backend /api/tools/:id does NOT return issues list,
    // only quantities.
    const { tool_issues, ...toolData } = tool;
    
    return {
      ...toolData,
      issued_quantity: issuedQuantity,
      available_quantity: availableQuantity
    };
  }

  // --- NOTIFICATIONS ---

  // REGISTER PUSH TOKEN (POST)
  if (route === '/api/notifications/register-push' && method === 'POST') {
    const { token, platform } = body;
    const user = getUserFromToken();
    
    if (user) {
      // Upsert token to push_tokens table
      // Assuming table: push_tokens (user_id, token, platform, updated_at)
      const { error } = await supabase.from('push_tokens')
        .upsert({ 
          user_id: user.id || user.sub,
          token: token,
          platform: platform,
          updated_at: new Date().toISOString()
        }, { onConflict: 'token' });
        
      if (error) console.error('Push token error:', error);
    }
    return { success: true };
  }

  // MARK ALL READ (POST)
  if (route === '/api/notifications/read-all' && method === 'POST') {
     const user = getUserFromToken();
     if (user) {
         await supabase.from('notifications')
           .update({ read: true, read_at: new Date().toISOString() })
           .eq('user_id', user.id || user.sub)
           .eq('read', false);
     }
     return { success: true };
  }

  // MARK ONE READ (POST)
  if (route.match(/^\/api\/notifications\/.+\/read$/) && method === 'POST') {
     const id = decodeURIComponent(route.split('/')[3]);
     await supabase.from('notifications')
       .update({ read: true, read_at: new Date().toISOString() })
       .eq('id', id);
     return { success: true };
  }

  // MARK ONE UNREAD (POST)
  if (route.match(/^\/api\/notifications\/.+\/unread$/) && method === 'POST') {
     const id = decodeURIComponent(route.split('/')[3]);
     await supabase.from('notifications')
       .update({ read: false, read_at: null })
       .eq('id', id);
     return { success: true };
  }

  // MARK RETURN REQUEST UNREAD (POST) - Specific endpoint used in NotificationsContext
  if (route.match(/^\/api\/notify-return\/.+\/unread$/) && method === 'POST') {
     const id = decodeURIComponent(route.split('/')[3]);
     await supabase.from('notifications')
       .update({ read: false, read_at: null })
       .eq('id', id);
     return { success: true };
  }

  // GET NOTIFICATIONS (GET) - Main endpoint for notification center
  if (route === '/api/notifications' && method === 'GET') {
    const user = getUserFromToken();
    if (!user) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id || user.sub)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return data || [];
  }

  // TOOL RETURN REQUESTS (GET)
  if (route.match(/^\/api\/tools\/\d+\/return-requests$/) && method === 'GET') {
    const toolId = route.split('/')[3];

    const { data: notifs, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('type', 'return_request')
      .eq('item_type', 'tool')
      .eq('item_id', toolId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Manual user fetch
    const userIds = [...new Set((notifs || []).map(n => n.user_id).filter(Boolean))];
    const userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, full_name, username').in('id', userIds);
      if (users) {
        users.forEach(u => { userMap[u.id] = u; });
      }
    }

    return (notifs || []).map(n => {
        const u = userMap[n.user_id];
        return {
            id: n.id,
            user_id: n.user_id,
            tool_id: n.item_id,
            message: n.message || '',
            read: !!n.read,
            read_at: n.read_at,
            created_at: n.created_at,
            recipient_name: u ? (u.full_name || u.username) : ''
        };
    });
  }

  // TOOL BY CODE (GET)
  if (route.match(/^\/api\/tools\/by-code\/.+$/) && method === 'GET') {
    const code = route.split('/').pop();
    
    // Search by sku or inventory_number
    const { data: tools, error } = await supabase
      .from('tools')
      .select('*, tool_issues(*)')
      .or(`sku.eq.${code},inventory_number.eq.${code}`);
      
    if (error || !tools || tools.length === 0) throw new Error('Tool not found');
    
    const tool = tools[0];

    // Calculate quantities
    const issuedQuantity = (tool.tool_issues || [])
      .filter(i => i.status === 'wydane')
      .reduce((sum, i) => sum + (i.quantity || 0), 0);
      
    const availableQuantity = tool.quantity - issuedQuantity;
    
    const { tool_issues, ...toolData } = tool;
    
    return {
      ...toolData,
      issued_quantity: issuedQuantity,
      available_quantity: availableQuantity
    };
  }

  // TOOL FULL DETAILS WITH HISTORY (GET)
  if (route.match(/^\/api\/tools\/\d+\/details$/) && method === 'GET') {
    const toolId = route.split('/')[3]; // /api/tools/:id/details
    
    // Fetch tool and issues with related data
    // Supabase join syntax: tool_issues(..., employees(...), users(...))
    const { data: tool, error } = await supabase
      .from('tools')
      .select(`
        *,
        tool_issues(
          *,
          employees(first_name, last_name, brand_number),
          users(full_name)
        )
      `)
      .eq('id', toolId)
      .single();
      
    if (error || !tool) throw new Error('Tool not found');

    // Process issues to flatten structure matches backend
    const issues = (tool.tool_issues || [])
      .filter(i => i.status === 'wydane') // Backend /details only returns active issues? 
      // Wait, backend /details returns: WHERE ti.tool_id = ? AND ti.status = 'wydane'
      // Yes.
      .map(i => ({
        ...i,
        employee_first_name: i.employees?.first_name,
        employee_last_name: i.employees?.last_name,
        employee_brand_number: i.employees?.brand_number,
        issued_by_user_name: i.users?.full_name
      }))
      .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));

    const issuedQuantity = issues.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const availableQuantity = tool.quantity - issuedQuantity;

    const { tool_issues, ...toolData } = tool;

    return {
      ...toolData,
      issued_quantity: issuedQuantity,
      available_quantity: availableQuantity,
      issues: issues
    };
  }

  // Helper to decode user from token
  const getUserFromToken = () => {
    const authHeader = headers?.Authorization || headers?.authorization;
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    if (!token) return null;
    
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch (e) {
      console.error('Error decoding token:', e);
      return null;
    }
  };

  // TOOL ISSUE (POST)
  if (route.match(/^\/api\/tools\/\d+\/issue$/) && method === 'POST') {
    const toolId = route.split('/')[3];
    const { employee_id, quantity = 1 } = body;
    const user = getUserFromToken();
    // Support both 'id' (our mock) and 'sub' (Supabase standard)
    const userId = user?.id || user?.sub;

    if (!userId) {
      console.error('Brak userId w tokenie podczas wydawania narzędzia. User payload:', user);
      throw new Error('Błąd autoryzacji: Nie rozpoznano użytkownika wydającego. Spróbuj się wylogować i zalogować ponownie.');
    }

    if (!employee_id) throw new Error('Employee ID is required');
    if (quantity < 1) throw new Error('Quantity must be greater than 0');

    // 1. Get tool and current issues
    const { data: tool, error: toolError } = await supabase
      .from('tools')
      .select('*, tool_issues(quantity, status)')
      .eq('id', toolId)
      .single();

    if (toolError || !tool) throw new Error('Tool not found');

    const issuedQuantity = (tool.tool_issues || [])
      .filter(i => i.status === 'wydane')
      .reduce((sum, i) => sum + (i.quantity || 0), 0);

    const availableQuantity = tool.quantity - issuedQuantity;

    if (availableQuantity < quantity) {
      throw new Error(`Insufficient quantity available. Available: ${availableQuantity}, requested: ${quantity}`);
    }

    // 2. Insert issue
    const { data: issue, error: issueError } = await supabase
      .from('tool_issues')
      .insert([{
        tool_id: toolId,
        employee_id: employee_id,
        issued_by_user_id: userId,
        quantity: quantity,
        status: 'wydane',
        issued_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (issueError) throw new Error(issueError.message);

    // 3. Update tool status
    const newIssuedQuantity = issuedQuantity + quantity;
    const newStatus = newIssuedQuantity >= tool.quantity ? 'wydane' : 'częściowo wydane';
    
    await supabase
      .from('tools')
      .update({ status: newStatus })
      .eq('id', toolId);

    // Fetch employee details for response
    const { data: employee } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employee_id)
      .single();

    return {
      message: `Issued ${quantity} items of the tool`,
      issue_id: issue.id,
      available_quantity: availableQuantity - quantity,
      employee_id: employee?.id,
      employee_first_name: employee?.first_name,
      employee_last_name: employee?.last_name,
      employee_brand_number: employee?.brand_number
    };
  }

  // TOOL RETURN (POST)
  if (route.match(/^\/api\/tools\/\d+\/return$/) && method === 'POST') {
    const toolId = route.split('/')[3];
    const { issue_id, quantity } = body;
    
    if (!issue_id) throw new Error('Issue ID is required');

    // 1. Get issue
    const { data: issue, error: issueError } = await supabase
      .from('tool_issues')
      .select('*')
      .eq('id', issue_id)
      .eq('tool_id', toolId)
      .eq('status', 'wydane')
      .single();

    if (issueError || !issue) throw new Error('Issue not found or already returned');

    const returnQuantity = quantity || issue.quantity;
    if (returnQuantity > issue.quantity) throw new Error('Cannot return more than was issued');

    if (returnQuantity === issue.quantity) {
      // Full return
      await supabase
        .from('tool_issues')
        .update({ status: 'zwrócone', returned_at: new Date().toISOString() })
        .eq('id', issue_id);
    } else {
      // Partial return
      // Update existing issue
      await supabase
        .from('tool_issues')
        .update({ quantity: issue.quantity - returnQuantity })
        .eq('id', issue_id);
        
      // Create new return entry
      await supabase
        .from('tool_issues')
        .insert([{
          tool_id: toolId,
          employee_id: issue.employee_id,
          issued_by_user_id: issue.issued_by_user_id,
          quantity: returnQuantity,
          status: 'zwrócone',
          returned_at: new Date().toISOString()
        }]);
    }

    // 2. Update tool status
    const { data: tool } = await supabase
      .from('tools')
      .select('*, tool_issues(quantity, status)')
      .eq('id', toolId)
      .single();

    if (tool) {
      const currentIssued = (tool.tool_issues || [])
        .filter(i => i.status === 'wydane')
        .reduce((sum, i) => sum + (i.quantity || 0), 0);
        
      let newStatus = 'dostępne';
      if (currentIssued > 0) {
        newStatus = currentIssued < tool.quantity ? 'częściowo wydane' : 'wydane';
      }
      
      await supabase
        .from('tools')
        .update({ status: newStatus })
        .eq('id', toolId);
    }

    return { message: 'Tool returned successfully' };
  }

  // --- INVENTORY MODULE ---

  // INVENTORY SESSIONS (GET)
  if (route === '/api/inventory/sessions' && method === 'GET') {
     const { data, error } = await supabase.from('inventory_sessions').select('*').order('created_at', { ascending: false });
     if (error) throw new Error(error.message);
     return data;
  }

  // INVENTORY SESSION CREATE (POST)
  if (route === '/api/inventory/sessions' && method === 'POST') {
     const { data, error } = await supabase.from('inventory_sessions').insert(body).select().single();
     if (error) throw new Error(error.message);
     return data;
  }
  
  // INVENTORY SESSION STATUS (PUT)
  if (route.match(/^\/api\/inventory\/sessions\/\d+\/status$/) && method === 'PUT') {
      const id = route.split('/')[4];
      const { action } = body;
      let status = 'active';
      if (action === 'pause') status = 'paused';
      if (action === 'resume') status = 'active';
      if (action === 'end') status = 'ended';
      
      const { data, error } = await supabase.from('inventory_sessions').update({ status }).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data;
  }

  // INVENTORY SESSION DELETE (DELETE)
  if (route.match(/^\/api\/inventory\/sessions\/\d+$/) && method === 'DELETE') {
      const id = route.split('/')[4];
      const { error } = await supabase.from('inventory_sessions').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { success: true };
  }

  // INVENTORY SCAN (POST)
  if (route.match(/^\/api\/inventory\/sessions\/\d+\/scan$/) && method === 'POST') {
      const sessionId = route.split('/')[4];
      const { code, quantity } = body;
      
      // Find tool
      const { data: tools, error: toolError } = await supabase
        .from('tools')
        .select('*')
        .or(`sku.eq.${code},inventory_number.eq.${code},barcode.eq.${code},qr_code.eq.${code}`);
      
      if (toolError || !tools || tools.length === 0) throw new Error('Tool not found');
      const tool = tools[0];
      
      // Upsert count
      const { data: existing } = await supabase.from('inventory_counts')
        .select('*')
        .eq('session_id', sessionId)
        .eq('tool_id', tool.id)
        .single();
        
      let result;
      if (existing) {
         const newQty = (existing.counted_qty || 0) + quantity;
         const { data, error } = await supabase.from('inventory_counts')
            .update({ counted_qty: newQty, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select().single();
         if (error) throw new Error(error.message);
         result = data;
      } else {
         const { data, error } = await supabase.from('inventory_counts')
            .insert({ session_id: sessionId, tool_id: tool.id, counted_qty: quantity })
            .select().single();
         if (error) throw new Error(error.message);
         result = data;
      }
      
      return { ...result, tool_name: tool.name, tool };
  }
  
  // INVENTORY UPDATE COUNT (PUT)
  if (route.match(/^\/api\/inventory\/sessions\/\d+\/counts\/\d+$/) && method === 'PUT') {
      const parts = route.split('/');
      const sessionId = parts[4];
      const toolId = parts[6];
      const { counted_qty } = body;
      
      const { data: existing } = await supabase.from('inventory_counts')
        .select('*')
        .eq('session_id', sessionId)
        .eq('tool_id', toolId)
        .single();
        
      if (existing) {
         const { data, error } = await supabase.from('inventory_counts')
            .update({ counted_qty: counted_qty, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select().single();
         if (error) throw new Error(error.message);
         return data;
      } else {
         const { data, error } = await supabase.from('inventory_counts')
            .insert({ session_id: sessionId, tool_id: toolId, counted_qty: counted_qty })
            .select().single();
         if (error) throw new Error(error.message);
         return data;
      }
  }

  // INVENTORY HISTORY (GET)
  if (route.match(/^\/api\/inventory\/sessions\/\d+\/history$/) && method === 'GET') {
      const sessionId = route.split('/')[4];
      
      const { data: counts } = await supabase.from('inventory_counts')
        .select('*, tools(name, sku, inventory_number)')
        .eq('session_id', sessionId)
        .order('updated_at', { ascending: false });
        
      const { data: corrections } = await supabase.from('inventory_corrections')
        .select('*, tools(name, sku, inventory_number)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
        
      return {
          counts: counts || [],
          corrections: corrections || []
      };
  }

  // INVENTORY DIFFERENCES (GET)
  if (route.match(/^\/api\/inventory\/sessions\/\d+\/differences$/) && method === 'GET') {
      const sessionId = route.split('/')[4];
      
      const { data: tools } = await supabase.from('tools').select('*');
      const { data: counts } = await supabase.from('inventory_counts').select('*').eq('session_id', sessionId);
      
      const countsMap = {};
      counts?.forEach(c => countsMap[c.tool_id] = c.counted_qty);
      
      // Calculate available quantities (system_qty)
      const { data: issues } = await supabase.from('tool_issues').select('*').eq('status', 'wydane');
      const issuedMap = {};
      issues?.forEach(i => {
          issuedMap[i.tool_id] = (issuedMap[i.tool_id] || 0) + i.quantity;
      });
      
      const diffs = [];
      tools?.forEach(t => {
          const issued = issuedMap[t.id] || 0;
          const systemQty = t.quantity - issued; 
          const counted = countsMap[t.id] || 0;
          
          if (systemQty !== counted) {
              diffs.push({
                  tool_id: t.id,
                  name: t.name,
                  sku: t.sku || t.inventory_number,
                  system_qty: systemQty,
                  counted_qty: counted,
                  difference: counted - systemQty
              });
          }
      });
      
      return diffs;
  }
  
  // INVENTORY ADD CORRECTION (POST)
  if (route.match(/^\/api\/inventory\/sessions\/\d+\/corrections$/) && method === 'POST') {
      const sessionId = route.split('/')[4];
      const { tool_id, difference_qty, reason } = body;
      
      const { data, error } = await supabase.from('inventory_corrections')
         .insert({
             session_id: sessionId,
             tool_id,
             difference_qty,
             reason,
             status: 'pending'
         })
         .select().single();
         
      if (error) throw new Error(error.message);
      return data;
  }
  
  // INVENTORY ACCEPT CORRECTION (POST)
  if (route.match(/^\/api\/inventory\/corrections\/\d+\/accept$/) && method === 'POST') {
      const id = route.split('/')[4];
      
      const { data: correction } = await supabase.from('inventory_corrections').select('*').eq('id', id).single();
      if (!correction) throw new Error('Correction not found');
      
      // Update correction
      await supabase.from('inventory_corrections').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', id);
      
      // Update tool quantity
      const { data: tool } = await supabase.from('tools').select('quantity').eq('id', correction.tool_id).single();
      if (tool) {
          const newQty = tool.quantity + correction.difference_qty;
          await supabase.from('tools').update({ quantity: newQty }).eq('id', correction.tool_id);
      }
      
      return { success: true };
  }

  // --- CONFIG MODULE ---

  // CONFIG GENERAL (GET)
  if (route === '/api/config/general' && method === 'GET') {
    const { data, error } = await supabase.from('app_config').select('*').limit(1).single();
    // Ignore error if no config found, just return defaults
    
    const config = data || {};
    
    return {
      appName: config.app_name || 'System Zarządzania',
      companyName: config.company_name || 'Moja Firma',
      timezone: config.timezone || 'Europe/Warsaw',
      language: config.language || 'pl',
      dateFormat: config.date_format || 'DD/MM/YYYY',
      toolsCodePrefix: config.tools_code_prefix || '',
      bhpCodePrefix: config.bhp_code_prefix || '',
      toolCategoryPrefixes: config.tool_category_prefixes || {}
    };
  }

  // CONFIG GENERAL (PUT)
  if (route === '/api/config/general' && method === 'PUT') {
    const { data: existing } = await supabase.from('app_config').select('id').limit(1).single();
    
    const payload = {
      app_name: body.appName,
      company_name: body.companyName,
      timezone: body.timezone,
      language: body.language,
      date_format: body.dateFormat,
      tools_code_prefix: body.toolsCodePrefix,
      bhp_code_prefix: body.bhpCodePrefix,
      tool_category_prefixes: body.toolCategoryPrefixes
    };

    if (existing) {
       const { error } = await supabase.from('app_config').update(payload).eq('id', existing.id);
       if (error) throw new Error(error.message);
    } else {
       const { error } = await supabase.from('app_config').insert(payload);
       if (error) throw new Error(error.message);
    }
    return { success: true };
  }

  // CONFIG EMAIL (GET)
  if (route === '/api/config/email' && method === 'GET') {
    const { data, error } = await supabase.from('app_config').select('*').limit(1).single();
    
    const config = data || {};
    return {
      host: config.smtp_host || '',
      port: config.smtp_port || 587,
      secure: config.smtp_secure || false,
      user: config.smtp_user || '',
      pass: config.smtp_pass || '',
      from: config.smtp_from || 'no-reply@example.com'
    };
  }

  // CONFIG EMAIL (PUT)
  if (route === '/api/config/email' && method === 'PUT') {
    const { data: existing } = await supabase.from('app_config').select('id').limit(1).single();
    
    const payload = {
      smtp_host: body.host,
      smtp_port: body.port,
      smtp_secure: body.secure,
      smtp_user: body.user,
      smtp_pass: body.pass,
      smtp_from: body.from
    };

    if (existing) {
       const { error } = await supabase.from('app_config').update(payload).eq('id', existing.id);
       if (error) throw new Error(error.message);
    } else {
       const { error } = await supabase.from('app_config').insert(payload);
       if (error) throw new Error(error.message);
    }
    return { success: true };
  }
  
  // CONFIG DATABASE (GET)
  if (route === '/api/config/database' && method === 'GET') {
      const { data } = await supabase.from('app_config').select('db_config').limit(1).single();
      const dbConfig = (data && data.db_config) ? data.db_config : {};
      return {
          dbSource: dbConfig.dbSource || 'supabase',
          supabaseUrl: dbConfig.supabaseUrl || '',
          supabaseKey: dbConfig.supabaseKey || ''
      };
  }

  // CONFIG DATABASE (PUT)
  if (route === '/api/config/database' && method === 'PUT') {
      const { data: existing } = await supabase.from('app_config').select('id').limit(1).single();
      const payload = { db_config: body };
      if (existing) {
         await supabase.from('app_config').update(payload).eq('id', existing.id);
      } else {
         await supabase.from('app_config').insert(payload);
      }
      return { success: true };
  }

  // --- ROLES & PERMISSIONS MODULE ---

  // ROLES PERMISSIONS (GET)
  if (route === '/api/role-permissions' && method === 'GET') {
     // Try role_permissions table
     const { data, error } = await supabase.from('role_permissions').select('*');
     
     if (error) {
         console.warn('role_permissions table error:', error.message);
         return {};
     }
     
     const result = {};
     data.forEach(row => {
        if (!result[row.role]) result[row.role] = [];
        result[row.role].push(row.permission);
     });
     return result;
  }

  // ROLE PERMISSIONS UPDATE (PUT)
  if (route.match(/^\/api\/role-permissions\/.+$/) && method === 'PUT') {
     const role = route.split('/').pop();
     const { permissions } = body; 
     
     // Delete existing
     await supabase.from('role_permissions').delete().eq('role', role);
     
     // Insert new
     if (permissions && permissions.length > 0) {
        const rows = permissions.map(p => ({ role, permission: p }));
        const { error } = await supabase.from('role_permissions').insert(rows);
        if (error) throw new Error(error.message);
     }
     return { success: true };
  }
  
  // PERMISSIONS LIST (GET)
  if (route === '/api/permissions' && method === 'GET') {
      const { data, error } = await supabase.from('role_permissions').select('permission');
      if (error) return [];
      const unique = [...new Set((data || []).map(r => r.permission))];
      return unique;
  }
  
  // ROLES META (GET)
  if (route === '/api/roles-meta' && method === 'GET') {
      const { data } = await supabase.from('app_config').select('roles_meta').limit(1).single();
      return { meta: (data && data.roles_meta) ? data.roles_meta : {} };
  }
  
  // ROLES META (PUT)
  if (route.match(/^\/api\/roles-meta\/.+$/) && method === 'PUT') {
      const role = route.split('/').pop();
      const { data: existing } = await supabase.from('app_config').select('id, roles_meta').limit(1).single();
      
      let meta = (existing && existing.roles_meta) ? existing.roles_meta : {};
      meta[role] = body; 
      
      if (existing) {
          await supabase.from('app_config').update({ roles_meta: meta }).eq('id', existing.id);
      } else {
          await supabase.from('app_config').insert({ roles_meta: meta });
      }
      return { success: true };
  }

  // --- CATEGORIES MODULE ---
  
  // CATEGORIES (GET)
  if (route === '/api/categories' && method === 'GET') {
      // Try categories table
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (!error) return data;
      
      // Fallback: try tool_categories
      const { data: tc, error: tcError } = await supabase.from('tool_categories').select('*').order('name');
      if (!tcError) return tc;
      
      // Fallback: distinct from tools
      const { data: tools } = await supabase.from('tools').select('category');
      const unique = [...new Set((tools || []).map(t => t.category).filter(Boolean))];
      return unique.map((name, i) => ({ id: i, name, tool_count: 0 }));
  }

  // Fallback to simple table mapping for other endpoints
  // e.g. /api/employees -> table 'employees'
  
  // Handle 'by-name' special case
  let byName = false;
  let nameValue = '';
  
  if (path.includes('/by-name/')) {
      const parts = path.split('/by-name/');
      const prefix = parts[0]; 
      nameValue = decodeURIComponent(parts[1]);
      byName = true;
      // Reconstruct simple table name from prefix (e.g. /api/positions -> positions)
      // Remove /api/ prefix
      const p = prefix.replace(/^\/api\//, '');
      // Use this as table
      const table = p.replace(/\/$/, '');
      
      let query = supabase.from(table);
      if (method === 'DELETE') {
         const { error } = await query.delete().eq('name', nameValue);
         if (error) throw error;
         return { success: true };
      }
      // Add GET by name if needed?
  }

  // Handle standard REST: /api/resource or /api/resource/:id
  const parts = path.replace(/^\/api\//, '').split('/');
  const table = parts[0];
  const id = parts.length > 1 ? parts[1] : null;

  // Simple table mapping/whitelist could be added here if needed
  let query = supabase.from(table);
  
  if (method === 'GET') {
    if (id) {
       const { data, error } = await query.select('*').eq('id', id).single();
       if (error) throw error;
       return data;
    }
    const { data, error } = await query.select('*');
    if (error) throw error;
    return data;
  }
  
  if (method === 'POST') {
    const { data, error } = await query.insert(body).select();
    if (error) throw error;
    return data?.[0] || {};
  }
  
  if (method === 'PUT') {
     if (id) {
        const { data, error } = await query.update(body).eq('id', id).select();
        if (error) throw error;
        return data?.[0] || {};
     }
  }

  if (method === 'DELETE') {
     if (id) {
        const { error } = await query.delete().eq('id', id);
        if (error) throw error;
        return { success: true };
     }
  }
  
  throw new Error(`Supabase endpoint not implemented: ${method} ${path}`);
};
