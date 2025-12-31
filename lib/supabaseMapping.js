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

async function generateEmployeeLogin(firstName, lastName, supabase) {
  const base = sanitizeNamePart(firstName, 3) + sanitizeNamePart(lastName, 3);
  const alphabet = '0123456789';
  
  for (let i = 0; i < 20; i++) {
    const candidate = base + randomFromAlphabet(4, alphabet);
    const { data } = await supabase.from('users').select('id').eq('username', candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Fallback to longer random if stuck
  return base + randomFromAlphabet(6, alphabet);
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
  if (route === '/api/push/register' && method === 'POST') {
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

  // TOOL SERVICE SEND (POST)
  if (route.match(/^\/api\/tools\/\d+\/service$/) && method === 'POST') {
    const toolId = route.split('/')[3];
    const { quantity, service_order_number } = body;
    
    // 1. Get tool
    const { data: tool, error: toolError } = await supabase
      .from('tools')
      .select('id, quantity, service_quantity, status')
      .eq('id', toolId)
      .single();

    if (toolError || !tool) throw new Error('Tool not found');

    const currentServiceQty = tool.service_quantity || 0;
    const sendQuantity = Math.max(1, parseInt(quantity || 1, 10));
    const availableForService = tool.quantity - currentServiceQty;

    if (sendQuantity > availableForService) {
      throw new Error(`Cannot send more than ${availableForService} items`);
    }

    const newServiceQuantity = currentServiceQty + sendQuantity;
    
    // Determine updates
    const updates = {
      service_quantity: newServiceQuantity,
      service_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (service_order_number) {
      updates.service_order_number = service_order_number;
    }
    
    if (tool.quantity === 1 && newServiceQuantity >= 1) {
      updates.status = 'serwis';
    }

    const { data: updatedTool, error: updateError } = await supabase
      .from('tools')
      .update(updates)
      .eq('id', toolId)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);
    
    // Save history
    await supabase.from('tool_service_history').insert([{
      tool_id: toolId,
      action: 'sent',
      quantity: sendQuantity,
      order_number: service_order_number || tool.service_order_number,
      created_at: new Date().toISOString()
    }]);

    return { 
      message: `Sent ${sendQuantity} item(s) to service`, 
      tool: updatedTool 
    };
  }

  // TOOL SERVICE RECEIVE (POST)
  if (route.match(/^\/api\/tools\/\d+\/service\/receive$/) && method === 'POST') {
    const toolId = route.split('/')[3];
    const { quantity } = body;

    // 1. Get tool
    const { data: tool, error: toolError } = await supabase
      .from('tools')
      .select('id, quantity, service_quantity, service_order_number, status')
      .eq('id', toolId)
      .single();

    if (toolError || !tool) throw new Error('Tool not found');

    const currentServiceQty = tool.service_quantity || 0;
    const receiveQuantity = Math.max(1, parseInt(quantity || currentServiceQty, 10));

    if (receiveQuantity > currentServiceQty) {
      throw new Error(`Maksymalnie można odebrać ${currentServiceQty} szt.`);
    }

    const remaining = currentServiceQty - receiveQuantity;
    
    const updates = {
      service_quantity: remaining,
      updated_at: new Date().toISOString()
    };

    if (remaining === 0) {
      updates.service_sent_at = null;
      updates.service_order_number = null;
      updates.status = 'dostępne'; 
    }

    const { data: updatedTool, error: updateError } = await supabase
      .from('tools')
      .update(updates)
      .eq('id', toolId)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    // Save history
    await supabase.from('tool_service_history').insert([{
      tool_id: toolId,
      action: 'received',
      quantity: receiveQuantity,
      order_number: tool.service_order_number,
      created_at: new Date().toISOString()
    }]);

    return {
      message: 'Received from service',
      tool: updatedTool
    };
  }

  // EMPLOYEES (REGENERATE LOGIN)
  if (route.match(/^\/api\/employees\/\d+\/regenerate-login$/) && method === 'POST') {
    const id = route.split('/')[3];
    const { first_name, last_name } = body; // Optional overrides

    // 1. Fetch employee
    const { data: emp, error: empError } = await supabase
      .from('employees')
      .select('id, first_name, last_name, login, email, phone, department, position, brand_number')
      .eq('id', id)
      .single();

    if (empError || !emp) throw new Error('Employee not found');

    const firstName = first_name || emp.first_name || '';
    const lastName = last_name || emp.last_name || '';
    
    if (!firstName || !lastName) {
      throw new Error('First and last name are required to generate login');
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const oldLogin = emp.login || '';

    // 2. Generate new login
    const newLogin = await generateEmployeeLogin(firstName, lastName, supabase);

    // 3. Update or create user
    // Check if user exists for this employee
    const { data: existingUser, error: userFetchError } = await supabase
      .from('users')
      .select('*')
      .eq('employee_id', id)
      .maybeSingle();

    if (userFetchError) throw new Error(userFetchError.message);

    if (existingUser) {
      // Update existing user
      const { error: updateError } = await supabase
        .from('users')
        .update({
          username: newLogin,
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          // Update other fields if they exist in employee record
          ...(emp.email ? { email: emp.email } : {}),
          ...(emp.phone ? { phone: emp.phone } : {}),
          ...(emp.department ? { department: emp.department } : {}),
          ...(emp.position ? { position: emp.position } : {}),
          ...(emp.brand_number ? { brand_number: emp.brand_number } : {}),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingUser.id);

      if (updateError) throw new Error(updateError.message);
    } else {
      // Create new user
      const rawPassword = generateRandomPassword(10);
      const hashedPassword = bcrypt.hashSync(rawPassword, 10);
      
      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          username: newLogin,
          password: hashedPassword,
          role: 'employee',
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          email: emp.email,
          phone: emp.phone,
          department: emp.department,
          position: emp.position,
          brand_number: emp.brand_number,
          employee_id: id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (insertError) throw new Error(insertError.message);
    }

    // 4. Update employee login
    const { error: empUpdateError } = await supabase
      .from('employees')
      .update({ login: newLogin })
      .eq('id', id);

    if (empUpdateError) throw new Error(empUpdateError.message);

    // 5. Audit Log
    const user = getUserFromToken();
    if (user) {
       await supabase.from('audit_logs').insert([{
         user_id: user.id,
         username: user.username,
         action: 'EMPLOYEE_REGENERATE_LOGIN',
         details: `Regenerated login for employeeId=${id}, oldLogin=${oldLogin || '-'}, newLogin=${newLogin}`,
         timestamp: new Date().toISOString()
       }]);
    }

    // Return result
    const { data: updatedEmp } = await supabase.from('employees').select('*').eq('id', id).single();
    
    return {
      login: newLogin,
      employee: updatedEmp
    };
  }

  // BHP (GET)
  if (route === '/api/bhp' && method === 'GET') {
    const user = getUserFromToken();
    const rawRole = String(user?.role || '').trim().toLowerCase();
    const isEmployeeRole = rawRole === 'employee';

    let query = supabase.from('bhp').select(`
      *,
      bhp_issues!left (
        employee_id,
        issued_at,
        status,
        employees (
          id,
          first_name,
          last_name
        )
      )
    `);

    // Filtering logic
    const search = queryParams.get('search');
    if (search) {
      query = query.or(`inventory_number.ilike.%${search}%,manufacturer.ilike.%${search}%,model.ilike.%${search}%,serial_number.ilike.%${search}%`);
    }

    const status = queryParams.get('status');
    if (status) {
      query = query.eq('status', status);
    }

    // Employee role restriction
    if (isEmployeeRole) {
      const { data: emp } = await supabase.from('employees').select('id').eq('username', user.username).single();
      
      if (emp) {
         // This requires inner join semantics which !inner gives
         query = supabase.from('bhp').select('*, bhp_issues!inner(employee_id, status)')
           .eq('bhp_issues.employee_id', emp.id)
           .eq('bhp_issues.status', 'wydane');
      }
    }

    // Sorting
    const sortBy = queryParams.get('sortBy');
    const sortDir = queryParams.get('sortDir') === 'desc' ? false : true;
    if (sortBy) {
      query = query.order(sortBy, { ascending: sortDir });
    } else {
      query = query.order('inventory_number', { ascending: true });
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Post-process to add assigned_employee_... fields from the active issue
    const processed = (data || []).map(item => {
      // Find active issue
      const activeIssue = (item.bhp_issues || [])
        .filter(i => i.status === 'wydane')
        .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at))[0];

      return {
        ...item,
        assigned_employee_id: activeIssue?.employees?.id,
        assigned_employee_first_name: activeIssue?.employees?.first_name,
        assigned_employee_last_name: activeIssue?.employees?.last_name,
        // Remove nested array to keep response clean if needed, or keep it
        bhp_issues: undefined 
      };
    });

    return processed;
  }

  // BHP (POST)
  if (route === '/api/bhp' && method === 'POST') {
    const { name, inventory_number, manufacturer, model, production_date, serial_number, catalog_number, inspection_date, status, is_set } = body;
    if (!name) throw new Error('Name is required');

    const { data, error } = await supabase.from('bhp').insert([{
      name,
      inventory_number,
      manufacturer,
      model,
      production_date,
      serial_number,
      catalog_number,
      inspection_date,
      status: status || 'dostępne',
      is_set: is_set ? 1 : 0,
      created_at: new Date().toISOString()
    }]).select().single();

    if (error) throw new Error(error.message);
    return data;
  }

  // BHP (PUT)
  if (route.match(/^\/api\/bhp\/\d+$/) && method === 'PUT') {
    const id = route.split('/')[3];
    const { name, inventory_number, manufacturer, model, production_date, serial_number, catalog_number, inspection_date, status, is_set } = body;
    
    let updates = {};
    if (name) updates.name = name;
    if (inventory_number !== undefined) updates.inventory_number = inventory_number;
    if (manufacturer !== undefined) updates.manufacturer = manufacturer;
    if (model !== undefined) updates.model = model;
    if (production_date !== undefined) updates.production_date = production_date;
    if (serial_number !== undefined) updates.serial_number = serial_number;
    if (catalog_number !== undefined) updates.catalog_number = catalog_number;
    if (inspection_date !== undefined) updates.inspection_date = inspection_date;
    if (status !== undefined) updates.status = status;
    if (is_set !== undefined) updates.is_set = is_set ? 1 : 0;

    const { data, error } = await supabase
      .from('bhp')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  // BHP (DELETE)
  if (route.match(/^\/api\/bhp\/\d+$/) && method === 'DELETE') {
    const id = route.split('/')[3];
    const { error } = await supabase.from('bhp').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // BHP ISSUE (POST) - Issue BHP to employee
  if (route.match(/^\/api\/bhp\/\d+\/issue$/) && method === 'POST') {
    const bhpId = route.split('/')[3];
    const { employee_id } = body;
    const user = getUserFromToken();

    if (!employee_id) throw new Error('Employee ID is required');

    // 1. Check status
    const { data: bhp, error: bhpError } = await supabase
      .from('bhp')
      .select('status')
      .eq('id', bhpId)
      .single();

    if (bhpError || !bhp) throw new Error('BHP item not found');
    if (bhp.status !== 'dostępne') throw new Error('BHP item is not available');

    // 2. Create issue
    const { data: issue, error: issueError } = await supabase
      .from('bhp_issues')
      .insert([{
        bhp_id: bhpId,
        employee_id,
        issued_by_user_id: user.id,
        issued_at: new Date().toISOString(),
        status: 'wydane'
      }])
      .select()
      .single();

    if (issueError) throw new Error(issueError.message);

    // 3. Update BHP status
    await supabase
      .from('bhp')
      .update({ status: 'wydane' })
      .eq('id', bhpId);

    return issue;
  }

  // BHP RETURN (POST) - Return BHP from employee
  if (route.match(/^\/api\/bhp\/\d+\/return$/) && method === 'POST') {
    const bhpId = route.split('/')[3];
    const user = getUserFromToken();

    // 1. Find active issue
    const { data: issue, error: issueError } = await supabase
      .from('bhp_issues')
      .select('*')
      .eq('bhp_id', bhpId)
      .eq('status', 'wydane')
      .single();

    if (issueError || !issue) throw new Error('No active issue found for this BHP item');

    // 2. Update issue
    await supabase
      .from('bhp_issues')
      .update({
        status: 'zwrócone',
        returned_at: new Date().toISOString(),
        returned_by_user_id: user.id
      })
      .eq('id', issue.id);

    // 3. Update BHP status
    await supabase
      .from('bhp')
      .update({ status: 'dostępne' })
      .eq('id', bhpId);

    return { success: true };
  }

  // BHP DETAILS (GET)
  if (route.match(/^\/api\/bhp\/\d+\/details$/) && method === 'GET') {
    const bhpId = route.split('/')[3];

    const { data: item, error } = await supabase
      .from('bhp')
      .select('*')
      .eq('id', bhpId)
      .single();

    if (error || !item) throw new Error('BHP item not found');

    // Fetch issues with details
    const { data: issues } = await supabase
      .from('bhp_issues')
      .select(`
        *,
        employees (first_name, last_name, brand_number),
        users (full_name)
      `)
      .eq('bhp_id', bhpId)
      .order('issued_at', { ascending: false });

    const processedIssues = (issues || []).map(i => ({
      ...i,
      employee_first_name: i.employees?.first_name,
      employee_last_name: i.employees?.last_name,
      employee_brand_number: i.employees?.brand_number,
      issued_by_user_name: i.users?.full_name
    }));

    // Compute review reminder
    let reviewReminder = null;
    if (item.inspection_date) {
      const now = new Date();
      const insp = new Date(item.inspection_date);
      const diffDays = Math.ceil((insp - now) / (1000 * 60 * 60 * 24));
      reviewReminder = {
        days_to_review: diffDays,
        status: diffDays < 0 ? 'po_terminie' : (diffDays <= 30 ? 'zbliża_się' : 'ok')
      };
    }

    return { ...item, issues: processedIssues, reviewReminder };
  }

  // BHP HISTORY (GET)
  if (route.match(/^\/api\/bhp\/\d+\/history$/) && method === 'GET') {
    const bhpId = route.split('/')[3];
    
    const { data: issues, error } = await supabase
      .from('bhp_issues')
      .select(`
        *,
        employees (first_name, last_name),
        users (full_name)
      `)
      .eq('bhp_id', bhpId)
      .order('issued_at', { ascending: false });

    if (error) throw new Error(error.message);

    const processed = (issues || []).map(i => ({
      ...i,
      employee_first_name: i.employees?.first_name,
      employee_last_name: i.employees?.last_name,
      issued_by_user_name: i.users?.full_name
    }));

    return processed;
  }

  // BHP ISSUES (GET) - History/Active issues
  if (route === '/api/bhp-issues' && method === 'GET') {
    const page = parseInt(queryParams.get('page') || '1');
    const limit = parseInt(queryParams.get('limit') || '10');
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    const status = queryParams.get('status');
    const employeeId = queryParams.get('employee_id');

    let query = supabase.from('bhp_issues').select(`
      *,
      bhp (
        inventory_number, manufacturer, model, production_date, serial_number, 
        catalog_number, inspection_date, status, is_set
      ),
      employees (
        first_name, last_name, brand_number
      ),
      users (
        full_name
      )
    `, { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }
    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }
    
    query = query.range(from, to).order('issued_at', { ascending: false });

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    // Flatten structure to match backend
    const issues = (data || []).map(i => ({
      ...i,
      bhp_inventory_number: i.bhp?.inventory_number,
      bhp_manufacturer: i.bhp?.manufacturer,
      bhp_model: i.bhp?.model,
      bhp_production_date: i.bhp?.production_date,
      bhp_serial_number: i.bhp?.serial_number,
      bhp_catalog_number: i.bhp?.catalog_number,
      bhp_inspection_date: i.bhp?.inspection_date,
      bhp_status: i.bhp?.status,
      bhp_is_set: i.bhp?.is_set,
      employee_first_name: i.employees?.first_name,
      employee_last_name: i.employees?.last_name,
      employee_brand_number: i.employees?.brand_number,
      issued_by_user_name: i.users?.full_name
    }));

    return {
      data: issues,
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

  // CONFIG DATABASE (PUT)
  if (route === '/api/config/database' && method === 'PUT') {
    throw new Error('Zmiana konfiguracji wymaga uruchomionego lokalnego backendu.');
  }

  // DEPARTMENTS (GET)
  if (route === '/api/departments' && method === 'GET') {
    const { data, error } = await supabase.from('departments').select('*').order('name');
    if (error) throw new Error(error.message);
    return data;
  }

  // DEPARTMENTS (POST)
  if (route === '/api/departments' && method === 'POST') {
    const { name, description, manager_id, status } = body;
    if (!name) throw new Error('Name is required');

    const { data, error } = await supabase.from('departments').insert([{
      name,
      description,
      manager_id: manager_id || null,
      status: status || 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]).select().single();

    if (error) throw new Error(error.message);
    return data;
  }

  // DEPARTMENTS (PUT)
  if (route.match(/^\/api\/departments\/\d+$/) && method === 'PUT') {
    const id = route.split('/')[3];
    const { name, description, manager_id, status } = body;
    
    const updates = { updated_at: new Date().toISOString() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (manager_id !== undefined) updates.manager_id = manager_id;
    if (status) updates.status = status;

    const { data, error } = await supabase
      .from('departments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  // DEPARTMENTS (DELETE)
  if (route.match(/^\/api\/departments\/\d+$/) && method === 'DELETE') {
    const id = route.split('/')[3];
    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // POSITIONS (GET)
  if (route === '/api/positions' && method === 'GET') {
    const { data, error } = await supabase.from('positions').select('*').order('name');
    if (error) throw new Error(error.message);
    return data;
  }

  // POSITIONS (POST)
  if (route === '/api/positions' && method === 'POST') {
    const { name, department_id, requirements, description, status } = body;
    if (!name) throw new Error('Name is required');

    const { data, error } = await supabase.from('positions').insert([{
      name,
      department_id: department_id || null,
      requirements,
      description,
      status: status || 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]).select().single();

    if (error) throw new Error(error.message);
    return data;
  }

  // POSITIONS (PUT)
  if (route.match(/^\/api\/positions\/\d+$/) && method === 'PUT') {
    const id = route.split('/')[3];
    const { name, department_id, requirements, description, status } = body;
    
    const updates = { updated_at: new Date().toISOString() };
    if (name) updates.name = name;
    if (department_id !== undefined) updates.department_id = department_id;
    if (requirements !== undefined) updates.requirements = requirements;
    if (description !== undefined) updates.description = description;
    if (status) updates.status = status;

    const { data, error } = await supabase
      .from('positions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  // POSITIONS (DELETE)
  if (route.match(/^\/api\/positions\/\d+$/) && method === 'DELETE') {
    const id = route.split('/')[3];
    const { error } = await supabase.from('positions').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // CATEGORIES (GET)
  if (route === '/api/categories' && method === 'GET') {
    const { data, error } = await supabase.from('tool_categories').select('*').order('name');
    if (error) throw new Error(error.message);
    return data;
  }

  // CATEGORIES (POST)
  if (route === '/api/categories' && method === 'POST') {
    const { name } = body;
    if (!name) throw new Error('Name is required');

    const { data, error } = await supabase.from('tool_categories').insert([{
      name
    }]).select().single();

    if (error) throw new Error(error.message);
    return data;
  }

  // CATEGORIES (DELETE)
  if (route.match(/^\/api\/categories\/\d+$/) && method === 'DELETE') {
    const id = route.split('/')[3];
    const { error } = await supabase.from('tool_categories').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  // ROLE PERMISSIONS (GET)
  if (route === '/api/role-permissions' && method === 'GET') {
    const user = getUserFromToken();
    const rawRole = String(user?.role || '').trim().toLowerCase();
    const isAdmin = rawRole === 'administrator' || rawRole === 'admin';

    if (isAdmin) {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('role, permission')
        .order('role')
        .order('permission');

      if (error) throw new Error(error.message);

      const rolePermissions = {};
      (data || []).forEach(row => {
        if (!rolePermissions[row.role]) {
          rolePermissions[row.role] = [];
        }
        rolePermissions[row.role].push(row.permission);
      });
      return rolePermissions;
    } else {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission')
        .eq('role', rawRole)
        .order('permission');

      if (error) throw new Error(error.message);

      const out = {};
      out[rawRole] = Array.from(new Set((data || []).map(r => r.permission)));
      return out;
    }
  }

  // ROLE PERMISSIONS (PUT)
  if (route.match(/^\/api\/role-permissions\/[^/]+$/) && method === 'PUT') {
    const user = getUserFromToken();
    const rawRole = String(user?.role || '').trim().toLowerCase();
    
    if (rawRole !== 'administrator' && rawRole !== 'admin') {
      throw new Error('Insufficient permissions to manage roles');
    }

    const role = route.split('/').pop();
    const { permissions } = body;

    if (!permissions || !Array.isArray(permissions)) {
      throw new Error('Invalid data — permissions array required');
    }

    // 1. Delete existing permissions for role
    const { error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role', role);

    if (deleteError) throw new Error(deleteError.message);

    // 2. Insert new permissions
    if (permissions.length > 0) {
      const rows = permissions.map(p => ({ role, permission: p }));
      const { error: insertError } = await supabase
        .from('role_permissions')
        .insert(rows);
      
      if (insertError) throw new Error(insertError.message);
    }
    
    return { success: true };
  }

  // AUDIT LOG (POST)
  if (route === '/api/audit' && method === 'POST') {
    const { user_id, action, details, timestamp } = body;
    await supabase.from('audit_logs').insert([{
      user_id,
      username: body.username,
      action,
      details: typeof details === 'object' ? JSON.stringify(details) : details,
      timestamp: timestamp || new Date().toISOString()
    }]);
    return { success: true };
  }

  // AUDIT LOG (GET)
  if (route === '/api/audit' && method === 'GET') {
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' });

    const action = queryParams.get('action');
    if (action && action !== 'all') {
      query = query.eq('action', action);
    }

    const username = queryParams.get('username');
    if (username) {
      query = query.ilike('username', `%${username}%`); 
    }

    const startDate = queryParams.get('startDate');
    if (startDate) {
      query = query.gte('timestamp', startDate);
    }

    const endDate = queryParams.get('endDate');
    if (endDate) {
      query = query.lte('timestamp', `${endDate}T23:59:59`);
    }

    const page = parseInt(queryParams.get('page') || '1');
    const limit = parseInt(queryParams.get('limit') || '50');
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to).order('timestamp', { ascending: false });

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    const userIds = [...new Set((data || []).map(l => l.user_id).filter(id => id))];
    const userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds);
      if (users) {
        users.forEach(u => { userMap[u.id] = u.full_name; });
      }
    }

    const logs = (data || []).map(log => ({
      ...log,
      user_full_name: userMap[log.user_id] || log.username || 'Unknown'
    }));
    
    return {
      logs,
      pagination: {
        total: count || 0,
        page: page,
        totalPages: Math.ceil((count || 0) / limit),
        limit
      }
    };
  }

  // TRANSLATIONS (GET)
  if (route.match(/^\/api\/translations\/[a-z]{2}$/) && method === 'GET') {
    const lang = route.split('/').pop();
    const { data, error } = await supabase
      .from('translate')
      .select('key, value')
      .eq('lang', lang);

    if (error) throw new Error(error.message);

    const map = {};
    (data || []).forEach(row => {
      map[row.key] = row.value;
    });

    return { lang, translations: map };
  }

  // TRANSLATE (GET)
  if (route === '/api/translate' && method === 'GET') {
    const lang = queryParams.get('lang');
    const search = queryParams.get('search');
    
    let query = supabase.from('translate').select('key, value');
    
    if (lang) {
      query = query.eq('lang', lang);
    }
    
    if (search) {
      query = query.ilike('key', `%${search}%`);
    }
    
    query = query.order('key');
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return data;
  }

  // TRANSLATE BULK (PUT)
  if (route === '/api/translate/bulk' && method === 'PUT') {
    const { updates } = body;
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error('No updates provided');
    }

    const { data, error } = await supabase
      .from('translate')
      .upsert(updates, { onConflict: 'lang, key' });

    if (error) throw new Error(error.message);

    return { updated: updates.length };
  }
  
  // CHAT - CONVERSATIONS (GET)
  if (route === '/api/chat/conversations' && method === 'GET') {
    const user = getUserFromToken();
    const uid = user.id;

    const { data: participations, error: pErr } = await supabase
      .from('chat_participants')
      .select('conversation_id')
      .eq('user_id', uid);
    
    if (pErr) throw new Error(pErr.message);
    const convIds = (participations || []).map(p => p.conversation_id);

    if (convIds.length === 0) return [];

    const { data: conversations } = await supabase
      .from('chat_conversations')
      .select('*')
      .in('id', convIds)
      .order('updated_at', { ascending: false });

    const results = [];
    
    for (const conv of (conversations || [])) {
      const { data: parts } = await supabase
        .from('chat_participants')
        .select('user_id, users(full_name, username)')
        .eq('conversation_id', conv.id);
      
      const others = (parts || []).filter(p => p.user_id !== uid);
      const title = others.length ? others.map(p => p.users?.full_name || p.users?.username || `#${p.user_id}`).join(', ') : `#${conv.id}`;

      const { data: lastMsg } = await supabase
        .from('chat_messages')
        .select('content, created_at, sender_id, users(full_name, username)')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const { data: msgsByOthers } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('conversation_id', conv.id)
        .neq('sender_id', uid);
        
      const msgIds = (msgsByOthers || []).map(m => m.id);
      let unreadCount = 0;
      
      if (msgIds.length > 0) {
        const { data: reads } = await supabase
          .from('chat_message_reads')
          .select('message_id')
          .eq('user_id', uid)
          .in('message_id', msgIds);
          
        const readSet = new Set((reads || []).map(r => r.message_id));
        unreadCount = msgIds.filter(id => !readSet.has(id)).length;
      }

      results.push({
        id: conv.id,
        title,
        last_message_preview: (lastMsg?.content || '').slice(0, 140),
        last_message_at: lastMsg?.created_at || null,
        last_sender_name: lastMsg?.users?.full_name || lastMsg?.users?.username || null,
        last_sender_id: lastMsg?.sender_id || null,
        unread_count: unreadCount
      });
    }
    
    return results;
  }

  // CHAT - CONVERSATIONS (POST)
  if (route === '/api/chat/conversations' && method === 'POST') {
    const user = getUserFromToken();
    const uid = user.id;
    const { recipient_id, recipient_ids } = body;
    
    const ids = Array.isArray(recipient_ids) ? recipient_ids.map(n => Number(n)).filter(n => n > 0) : [];
    if (recipient_id) ids.push(Number(recipient_id));
    const uniqueIds = Array.from(new Set(ids.filter(n => n && n !== uid)));
    
    if (uniqueIds.length === 0) throw new Error('Invalid recipients');

    if (uniqueIds.length === 1) {
      const otherId = uniqueIds[0];
      const { data: myConvos } = await supabase.from('chat_participants').select('conversation_id').eq('user_id', uid);
      const myConvIds = (myConvos || []).map(c => c.conversation_id);
      
      if (myConvIds.length > 0) {
        const { data: otherConvos } = await supabase.from('chat_participants').select('conversation_id').eq('user_id', otherId).in('conversation_id', myConvIds);
        
        if (otherConvos && otherConvos.length > 0) {
           return { id: otherConvos[0].conversation_id };
        }
      }
    }

    const { data: newConv, error: cErr } = await supabase
      .from('chat_conversations')
      .insert([{ created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
      .select()
      .single();
      
    if (cErr) throw new Error(cErr.message);
    
    const participants = [uid, ...uniqueIds].map(uId => ({
      conversation_id: newConv.id,
      user_id: uId
    }));
    
    const { error: pErr } = await supabase.from('chat_participants').insert(participants);
    if (pErr) throw new Error(pErr.message);
    
    return { id: newConv.id };
  }

  // CHAT - MESSAGES WITH ATTACHMENTS (POST)
  if (route.match(/^\/api\/chat\/conversations\/\d+\/messages\/attachments$/) && method === 'POST') {
    const convId = route.split('/')[4];
    const user = getUserFromToken();
    const uid = user.id;

    const content = body.get('content') || '';
    const files = body.getAll('files');

    const { data: part } = await supabase.from('chat_participants').select('id').eq('conversation_id', convId).eq('user_id', uid).single();
    if (!part) throw new Error('Permission denied');

    const { data: block } = await supabase.from('chat_blocks').select('conversation_id').eq('conversation_id', convId).eq('blocked_user_id', uid).single();
    if (block) throw new Error('Permission denied');

    const { data: msg, error: mErr } = await supabase
      .from('chat_messages')
      .insert([{
        conversation_id: convId,
        sender_id: uid,
        content: content,
        created_at: new Date().toISOString()
      }])
      .select('*, users(full_name)')
      .single();

    if (mErr) throw new Error(mErr.message);

    const uploadedAttachments = [];
    
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const filePath = `${filename}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat_attachments')
        .upload(filePath, file);
        
      if (uploadError) {
        console.error('Upload error:', uploadError);
        continue; 
      }
      
      const { data: publicUrlData } = supabase.storage.from('chat_attachments').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;

      const { data: att, error: aErr } = await supabase
        .from('chat_attachments')
        .insert([{
          conversation_id: convId,
          message_id: msg.id,
          filename: filename,
          original_name: file.name,
          mime_type: file.type,
          size: file.size,
          url: publicUrl,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
        
      if (!aErr && att) {
        uploadedAttachments.push(att);
      }
    }

    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);

    return {
      ...msg,
      sender_name: msg.users?.full_name,
      attachments: uploadedAttachments
    };
  }

  // CHAT - ADD ATTACHMENTS TO MESSAGE (POST)
  if (route.match(/^\/api\/chat\/messages\/\d+\/attachments$/) && method === 'POST') {
    const msgId = route.split('/')[4];
    const user = getUserFromToken();
    const uid = user.id;

    const files = body.getAll('files');
    if (!files || files.length === 0) throw new Error('No files');

    const { data: msg, error: mErr } = await supabase.from('chat_messages').select('id, conversation_id, sender_id').eq('id', msgId).single();
    if (mErr || !msg) throw new Error('Message not found');

    if (msg.sender_id !== uid) throw new Error('Permission denied');

    const uploadedAttachments = [];

    for (const file of files) {
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const filePath = `${filename}`;
      
      const { error: uploadError } = await supabase.storage
        .from('chat_attachments')
        .upload(filePath, file);
        
      if (uploadError) {
        console.error('Upload error:', uploadError);
        continue;
      }
      
      const { data: publicUrlData } = supabase.storage.from('chat_attachments').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;

      const { data: att, error: aErr } = await supabase
        .from('chat_attachments')
        .insert([{
          conversation_id: msg.conversation_id,
          message_id: msgId,
          filename: filename,
          original_name: file.name,
          mime_type: file.type,
          size: file.size,
          url: publicUrl,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (!aErr && att) {
        uploadedAttachments.push(att);
      }
    }

    return {
      message_id: msgId,
      attachments: uploadedAttachments
    };
  }

  // CHAT - MESSAGES (GET)
  if (route.match(/^\/api\/chat\/conversations\/\d+\/messages$/) && method === 'GET') {
    const convId = route.split('/')[4];
    const user = getUserFromToken();
    const uid = user.id;
    const beforeRaw = queryParams.get('before');

    const { data: part } = await supabase.from('chat_participants').select('id').eq('conversation_id', convId).eq('user_id', uid).single();
    if (!part) throw new Error('Permission denied');

    let query = supabase
      .from('chat_messages')
      .select('*, users(full_name, username), reply_to:chat_messages!reply_to_id(content, sender_id, users(full_name))')
      .eq('conversation_id', convId);

    if (beforeRaw) {
       const asNum = Number(beforeRaw);
       if (!Number.isNaN(asNum) && asNum > 0) {
         query = query.lt('id', asNum);
       } else {
         query = query.lt('created_at', beforeRaw);
       }
    }

    query = query.order('created_at', { ascending: true }).limit(50);

    const { data: messages, error } = await query;
    if (error) throw new Error(error.message);

    const enriched = await Promise.all((messages || []).map(async (m) => {
      const { data: readByMe } = await supabase.from('chat_message_reads').select('read_at').eq('message_id', m.id).eq('user_id', uid).single();
      const { data: readers } = await supabase.from('chat_message_reads').select('user_id, users(full_name)').eq('message_id', m.id);
      const { data: atts } = await supabase.from('chat_attachments').select('*').eq('message_id', m.id);

      return {
        id: m.id,
        sender_id: m.sender_id,
        sender_name: m.users?.full_name || m.users?.username,
        content: m.content,
        created_at: m.created_at,
        reply_to_id: m.reply_to_id,
        reply_to_content: m.reply_to?.content,
        reply_to_sender_name: m.reply_to?.users?.full_name,
        read_by_me: !!readByMe,
        read_by: (readers || []).map(r => ({ user_id: r.user_id, name: r.users?.full_name })),
        read_by_names: (readers || []).map(r => r.users?.full_name),
        attachments: atts || []
      };
    }));

    return enriched;
  }

  // CHAT - MESSAGES (POST)
  if (route.match(/^\/api\/chat\/conversations\/\d+\/messages$/) && method === 'POST') {
    const convId = route.split('/')[4];
    const { content, reply_to_id } = body;
    const user = getUserFromToken();
    const uid = user.id;

    if (!content) throw new Error('Content required');

    const { data: msg, error } = await supabase
      .from('chat_messages')
      .insert([{
        conversation_id: convId,
        sender_id: uid,
        content,
        reply_to_id: reply_to_id || null,
        created_at: new Date().toISOString()
      }])
      .select('*, users(full_name)')
      .single();

    if (error) throw new Error(error.message);
    
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);

    return {
      ...msg,
      sender_name: msg.users?.full_name
    };
  }

  // CHAT - MARK READ (POST)
  if (route.match(/^\/api\/chat\/conversations\/\d+\/read$/) && method === 'POST') {
    const convId = route.split('/')[4];
    const user = getUserFromToken();
    const uid = user.id;

    const { data: unreadMsgs } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', convId);
      
    const { data: myReads } = await supabase
      .from('chat_message_reads')
      .select('message_id')
      .eq('user_id', uid)
      .in('message_id', (unreadMsgs || []).map(m => m.id));
      
    const readIds = new Set((myReads || []).map(r => r.message_id));
    const toRead = (unreadMsgs || []).filter(m => !readIds.has(m.id)).map(m => ({
      message_id: m.id,
      user_id: uid,
      read_at: new Date().toISOString()
    }));
    
    if (toRead.length > 0) {
      await supabase.from('chat_message_reads').insert(toRead);
    }

    return { marked: toRead.length };
  }

  // CHAT - MARK UNREAD (POST)
  if (route.match(/^\/api\/chat\/conversations\/\d+\/unread$/) && method === 'POST') {
    const convId = route.split('/')[4];
    const user = getUserFromToken();
    const uid = user.id;
    
    const { data: msgs } = await supabase.from('chat_messages').select('id').eq('conversation_id', convId);
    const msgIds = (msgs || []).map(m => m.id);
    
    if (msgIds.length > 0) {
      await supabase
        .from('chat_message_reads')
        .delete()
        .eq('user_id', uid)
        .in('message_id', msgIds);
    }
    
    return { cleared: msgIds.length };
  }

  // CHAT - EDIT MESSAGE (PUT)
  if (route.match(/^\/api\/chat\/messages\/\d+$/) && method === 'PUT') {
    const msgId = route.split('/')[4];
    const { content } = body;
    const user = getUserFromToken();
    const uid = user.id;

    if (!content) throw new Error('Content required');

    const { data: msg } = await supabase.from('chat_messages').select('sender_id, conversation_id').eq('id', msgId).single();
    if (!msg) throw new Error('Message not found');
    if (msg.sender_id !== uid) throw new Error('Permission denied');

    const { data: updated, error } = await supabase
      .from('chat_messages')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', msgId)
      .select('*, users(full_name)')
      .single();

    if (error) throw new Error(error.message);
    
    return {
      ...updated,
      sender_name: updated.users?.full_name,
      type: 'update'
    };
  }

  // CHAT - DELETE MESSAGE (DELETE)
  if (route.match(/^\/api\/chat\/messages\/\d+$/) && method === 'DELETE') {
    const msgId = route.split('/')[4];
    const user = getUserFromToken();
    const uid = user.id;

    const { data: msg } = await supabase.from('chat_messages').select('sender_id, conversation_id').eq('id', msgId).single();
    if (!msg) throw new Error('Message not found');
    if (msg.sender_id !== uid) throw new Error('Permission denied');

    const { data: attachments } = await supabase.from('chat_attachments').select('filename').eq('message_id', msgId);
    if (attachments && attachments.length > 0) {
      const filenames = attachments.map(a => a.filename);
      await supabase.storage.from('chat_attachments').remove(filenames);
      await supabase.from('chat_attachments').delete().eq('message_id', msgId);
    }

    await supabase.from('chat_message_reads').delete().eq('message_id', msgId);
    const { error } = await supabase.from('chat_messages').delete().eq('id', msgId);
    if (error) throw new Error(error.message);

    return { success: true };
  }

  // CHAT - BLOCK CONVERSATION (POST)
  if (route.match(/^\/api\/chat\/conversations\/\d+\/block$/) && method === 'POST') {
    const convId = route.split('/')[4];
    const user = getUserFromToken();
    const uid = user.id;

    const { data: part } = await supabase.from('chat_participants').select('id').eq('conversation_id', convId).eq('user_id', uid).single();
    if (!part) throw new Error('Permission denied');

    const { data: others } = await supabase.from('chat_participants').select('user_id').eq('conversation_id', convId).neq('user_id', uid);
    const ids = (others || []).map(o => o.user_id);

    if (ids.length > 0) {
      const blocks = ids.map(blockedId => ({
        conversation_id: convId,
        blocked_user_id: blockedId,
        blocked_by: uid,
        blocked_at: new Date().toISOString()
      }));
      await supabase.from('chat_blocks').upsert(blocks, { onConflict: 'conversation_id, blocked_user_id' });
    }

    return { blocked: ids.length };
  }

  // CHAT - DELETE CONVERSATION (DELETE)
  if (route.match(/^\/api\/chat\/conversations\/\d+$/) && method === 'DELETE') {
    const convId = route.split('/')[4];
    const user = getUserFromToken();
    const uid = user.id;

    const { error } = await supabase.from('chat_participants').delete().eq('conversation_id', convId).eq('user_id', uid);
    if (error) throw new Error(error.message);

    const { count } = await supabase.from('chat_participants').select('*', { count: 'exact', head: true }).eq('conversation_id', convId);

    if (count === 0) {
      const { data: files } = await supabase.from('chat_attachments').select('filename').eq('conversation_id', convId);
      if (files && files.length > 0) {
        await supabase.storage.from('chat_attachments').remove(files.map(f => f.filename));
      }
      await supabase.from('chat_attachments').delete().eq('conversation_id', convId);
      
      const { data: msgs } = await supabase.from('chat_messages').select('id').eq('conversation_id', convId);
      const msgIds = (msgs || []).map(m => m.id);
      if (msgIds.length > 0) {
        await supabase.from('chat_message_reads').delete().in('message_id', msgIds);
      }
      await supabase.from('chat_messages').delete().eq('conversation_id', convId);
      
      await supabase.from('chat_typing_events').delete().eq('conversation_id', convId);
      await supabase.from('chat_blocks').delete().eq('conversation_id', convId);
      
      await supabase.from('chat_conversations').delete().eq('id', convId);
      
      return { removed: 1, removedForUser: true, remainingParticipants: 0 };
    }

    return { removedForUser: true, remainingParticipants: count };
  }

  // CHAT - TYPING HISTORY (GET)
  if (route.match(/^\/api\/chat\/conversations\/\d+\/typing-history$/) && method === 'GET') {
    const conversationId = route.split('/')[4];
    const { data, error } = await supabase
      .from('chat_typing_events')
      .select('user_id, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return data;
  }

  // OPEN GRAPH (GET)
  if (route === '/api/og' && method === 'GET') {
    console.warn('Open Graph fetching is limited in Supabase client-side mode.');
    return { success: false, message: 'Not supported in client mode' };
  }

  // CHAT - GLOBAL UNREAD COUNT (GET)
  if (route === '/api/chat/unread-count' && method === 'GET') {
    const user = getUserFromToken();
    const uid = user.id;

    const { data: myConvs } = await supabase.from('chat_participants').select('conversation_id').eq('user_id', uid);
    const convIds = (myConvs || []).map(c => c.conversation_id);

    if (convIds.length === 0) return { unread: 0 };

    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('id')
      .in('conversation_id', convIds)
      .neq('sender_id', uid);
      
    const msgIds = (msgs || []).map(m => m.id);
    
    if (msgIds.length === 0) return { unread: 0 };

    const { data: myReads } = await supabase
      .from('chat_message_reads')
      .select('message_id')
      .eq('user_id', uid)
      .in('message_id', msgIds);
      
    const readSet = new Set((myReads || []).map(r => r.message_id));
    const unreadCount = msgIds.filter(id => !readSet.has(id)).length;

    return { unread: unreadCount };
  }

  // NOTIFICATIONS - ADMIN (GET)
  if (route === '/api/notifications/admin' && method === 'GET') {
    const page = parseInt(queryParams.get('page') || '1');
    const limit = parseInt(queryParams.get('limit') || '50');
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    const { data, count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
      
    if (error) throw new Error(error.message);
    
    return {
      notifications: data,
      total: count,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    };
  }

  // NOTIFICATIONS - HISTORY (GET)
  if (route === '/api/notifications/history' && method === 'GET') {
     const page = parseInt(queryParams.get('page') || '1');
     const limit = parseInt(queryParams.get('limit') || '50');
     const from = (page - 1) * limit;
     const to = from + limit - 1;

     const { data, count, error } = await supabase
       .from('notification_history')
       .select('*, notification_history_recipients(count)', { count: 'exact' })
       .order('created_at', { ascending: false })
       .range(from, to);

     if (error) throw new Error(error.message);

     return {
       history: data,
       total: count,
       page,
       totalPages: Math.ceil((count || 0) / limit)
     };
  }

  // NOTIFICATIONS - BROADCAST (POST)
  if (route === '/api/notifications/broadcast' && method === 'POST') {
    const user = getUserFromToken();
    const { sender, subject, message, fanout, url } = body;
    
    if (!sender || !subject || !message) {
      throw new Error('Missing required fields');
    }

    const { data: history, error: hErr } = await supabase
      .from('notification_history')
      .insert({
        type: 'broadcast',
        sender,
        subject,
        message,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (hErr) throw new Error(hErr.message);

    let fanoutCount = 0;
    if (fanout) {
      const { data: users } = await supabase.from('users').select('id');
      if (users && users.length > 0) {
        const notifs = users.map(u => ({
          user_id: u.id,
          type: 'broadcast',
          item_type: 'admin',
          item_id: 0,
          subject,
          target_url: url || '/',
          message: sender ? `od: ${sender} — ${message}` : message,
          read: 0,
          created_at: new Date().toISOString()
        }));
        
        const { error: fErr } = await supabase.from('notifications').insert(notifs);
        if (fErr) console.error('Fanout error:', fErr.message);
        else fanoutCount = users.length;
      }
    }

    return { id: history.id, message: 'Powiadomienie wysłane', fanoutCount };
  }

  // NOTIFICATIONS - CUSTOM (POST)
  if (route === '/api/notifications/custom' && method === 'POST') {
    const user = getUserFromToken();
    const { sender, subject, message, userIds, fanout, url } = body;
    
    const ids = Array.isArray(userIds) ? userIds.map(v => parseInt(v)).filter(v => v > 0) : [];

    if (!sender || !subject || !message || ids.length === 0) {
      throw new Error('Missing required fields');
    }

    const { data: history, error: hErr } = await supabase
      .from('notification_history')
      .insert({
        type: 'custom',
        sender,
        subject,
        message,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (hErr) throw new Error(hErr.message);

    const { data: recipients } = await supabase.from('users').select('id, full_name, username').in('id', ids);
    if (recipients && recipients.length > 0) {
      const recInserts = recipients.map(r => ({
        history_id: history.id,
        user_id: r.id,
        name: r.full_name || r.username
      }));
      await supabase.from('notification_history_recipients').insert(recInserts);
    }

    let fanoutCount = 0;
    if (fanout) {
      const notifs = ids.map(uid => ({
        user_id: uid,
        type: 'custom',
        item_type: 'admin',
        item_id: 0,
        subject,
        target_url: url || '/',
        message: sender ? `od: ${sender} — ${message}` : message,
        read: 0,
        created_at: new Date().toISOString()
      }));
      
      const { error: fErr } = await supabase.from('notifications').insert(notifs);
      if (fErr) console.error('Fanout error:', fErr.message);
      else fanoutCount = ids.length;
    }

    return { id: history.id, message: 'Powiadomienie wysłane', recipientsCount: ids.length, fanoutCount };
  }

  // NOTIFICATIONS - DELETE BULK (POST)
  if (route === '/api/notifications/bulk-delete' && method === 'POST') {
    const { ids } = body;
    const cleanIds = Array.isArray(ids) ? ids.map(v => parseInt(v)).filter(v => v > 0) : [];
    
    if (cleanIds.length === 0) throw new Error('Missing IDs');

    const { error, count } = await supabase
      .from('notifications')
      .delete({ count: 'exact' })
      .in('id', cleanIds);

    if (error) throw new Error(error.message);
    return { message: 'Notifications deleted', deleted: count };
  }

  // NOTIFICATIONS - DELETE BY TYPE (DELETE)
  if (route === '/api/notifications' && method === 'DELETE') {
    const type = queryParams.get('type');
    const itemType = queryParams.get('item_type');
    
    if (!type && !itemType) throw new Error('Missing filters');

    let query = supabase.from('notifications').delete({ count: 'exact' });
    if (type) query = query.eq('type', type);
    if (itemType) query = query.eq('item_type', itemType);

    const { error, count } = await query;
    if (error) throw new Error(error.message);
    return { message: 'Notifications deleted', deleted: count };
  }

  // NOTIFICATIONS - DELETE HISTORY (DELETE)
  if (route === '/api/notifications/history' && method === 'DELETE') {
    const type = queryParams.get('type');
    if (type !== 'broadcast' && type !== 'custom') throw new Error('Invalid type');

    const { error, count } = await supabase
      .from('notification_history')
      .delete({ count: 'exact' })
      .eq('type', type);

    if (error) throw new Error(error.message);
    
    const typesToDel = type === 'broadcast' ? ['broadcast', 'admin_message'] : ['custom', 'admin_message'];
    await supabase.from('notifications').delete().eq('item_type', 'admin').in('type', typesToDel);

    return { message: 'History deleted', deleted_history: count };
  }

  // DASHBOARD STATS
  if (route === '/api/dashboard/stats' && method === 'GET') {
    const { count: totalEmployees } = await supabase.from('employees').select('*', { count: 'exact', head: true });
    
    const { data: depts } = await supabase.from('departments').select('name');
    const activeDepartments = new Set((depts || []).map(d => d.name)).size;

    const { data: positions } = await supabase.from('positions').select('name');
    const totalPositions = new Set((positions || []).map(p => p.name)).size;

    const { count: totalTools } = await supabase.from('tools').select('*', { count: 'exact', head: true });

    return {
      totalEmployees: totalEmployees || 0,
      activeDepartments: activeDepartments || 0,
      totalPositions: totalPositions || 0,
      totalTools: totalTools || 0
    };
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

  // CONFIG SECURITY (GET)
  if (route === '/api/config/security' && method === 'GET') {
    const { data, error } = await supabase.from('app_config').select('*').limit(1).single();
    const config = data || {};
    return {
      minLength: config.password_min_length || 8,
      requireUppercase: !!config.require_uppercase,
      requireNumber: !!config.require_numbers,
      requireSymbol: !!config.require_special_chars,
      lockoutThreshold: config.max_login_attempts || 5,
      lockoutWindowMinutes: config.lockout_duration_minutes || 15,
      sessionTimeoutMinutes: config.session_timeout_minutes || 60,
      strongPasswords: !!(config.require_uppercase && config.require_numbers && config.require_special_chars)
    };
  }

  // CONFIG SECURITY (PUT)
  if (route === '/api/config/security' && method === 'PUT') {
    const { data: existing } = await supabase.from('app_config').select('id').limit(1).single();
    
    const payload = {
      password_min_length: parseInt(body.minLength || 8),
      require_uppercase: body.requireUppercase ? 1 : 0,
      require_numbers: body.requireNumber ? 1 : 0,
      require_special_chars: body.requireSymbol ? 1 : 0,
      max_login_attempts: parseInt(body.lockoutThreshold || 5),
      lockout_duration_minutes: parseInt(body.lockoutWindowMinutes || 15),
      session_timeout_minutes: parseInt(body.sessionTimeoutMinutes || 60)
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
