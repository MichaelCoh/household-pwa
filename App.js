import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, Platform } from 'react-native';

import HomeScreen from './src/screens/HomeScreen';
import ShoppingListsScreen from './src/screens/ShoppingListsScreen';
import ShoppingDetailScreen from './src/screens/ShoppingDetailScreen';
import TasksScreen from './src/screens/TasksScreen';
import { CalendarScreen, BudgetScreen, SettingsScreen } from './src/screens/OtherScreens';
import { Colors, TAB_COLORS } from './src/theme';

const Tab = createBottomTabNavigator();
const ShoppingStack = createStackNavigator();

function ShoppingNavigator() {
  return (
    <ShoppingStack.Navigator screenOptions={{ headerShown: false }}>
      <ShoppingStack.Screen name="ShoppingLists" component={ShoppingListsScreen} />
      <ShoppingStack.Screen name="ShoppingDetail" component={ShoppingDetailScreen} />
    </ShoppingStack.Navigator>
  );
}

const TABS = [
  { name: 'HomeTab',     label: 'Home',     icon: '🏠', color: TAB_COLORS.home,     component: HomeScreen },
  { name: 'ShoppingTab', label: 'Shopping', icon: '🛒', color: TAB_COLORS.shopping, component: ShoppingNavigator },
  { name: 'TasksTab',    label: 'Tasks',    icon: '✅', color: TAB_COLORS.tasks,    component: TasksScreen },
  { name: 'CalendarTab', label: 'Calendar', icon: '📅', color: TAB_COLORS.calendar, component: CalendarScreen },
  { name: 'BudgetTab',   label: 'Budget',   icon: '💳', color: TAB_COLORS.budget,   component: BudgetScreen },
  { name: 'SettingsTab', label: 'Settings', icon: '⚙️', color: Colors.primary,      component: SettingsScreen },
];

function TabIcon({ focused, icon, color }) {
  return (
    <View style={[styles.tabIcon, focused && { backgroundColor: color + '18' }]}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{icon}</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarLabelStyle: styles.tabLabel,
            tabBarActiveTintColor: Colors.primary,
            tabBarInactiveTintColor: Colors.tabInactive,
          }}
        >
          {TABS.map(({ name, label, icon, color, component }) => (
            <Tab.Screen
              key={name}
              name={name}
              component={component}
              options={{
                tabBarLabel: label,
                tabBarActiveTintColor: color,
                tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={icon} color={color} />,
              }}
            />
          ))}
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBg,
    borderTopColor: Colors.tabBorder,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : Platform.OS === 'web' ? 60 : 68,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 6,
  },
  tabIcon: { width: 40, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
});
