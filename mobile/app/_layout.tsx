import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginScreen from "@/components/LoginScreen";

function RootLayoutNav() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#f8fafc" },
          headerTintColor: "#1e293b",
          headerTitleStyle: { fontWeight: "600" },
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="derivacion/nueva"
          options={{ title: "Nueva Derivación" }}
        />
        <Stack.Screen
          name="necesidad-especial"
          options={{ title: "Necesidad Especial" }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
