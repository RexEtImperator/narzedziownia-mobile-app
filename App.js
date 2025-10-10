import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/Login';
import DashboardScreen from './screens/Dashboard';
import ToolsScreen from './screens/Tools';
import EmployeesScreen from './screens/Employees';
import DepartmentsScreen from './screens/Departments';
import PositionsScreen from './screens/Positions';
import IssueReturnScreen from './screens/IssueReturn';
import UserSettingsScreen from './screens/UserSettings';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator initialRouteName="Login">
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Issue/Return" component={IssueReturnScreen} />
        <Tab.Screen name="Tools" component={ToolsScreen} />
        <Tab.Screen name="Employees" component={EmployeesScreen} />
        <Tab.Screen name="Departments" component={DepartmentsScreen} />
        <Tab.Screen name="Positions" component={PositionsScreen} />
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Login" component={LoginScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
        <Tab.Screen name="User" component={UserSettingsScreen} />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  
});
