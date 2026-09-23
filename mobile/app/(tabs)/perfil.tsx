import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useAuth } from "@/contexts/AuthContext";

export default function PerfilScreen() {
  const { profile, signOut } = useAuth();

  async function handleSignOut() {
    Alert.alert("Cerrar sesión", "¿Estás seguro que deseas cerrar sesión?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: () => signOut(),
      },
    ]);
  }

  const roleLabels: Record<string, string> = {
    global: "Administrador Global",
    director: "Director",
    admin_ie: "Administrador I.E.",
    coordinador: "Coordinador",
    docente: "Docente",
    psicologo: "Psicólogo",
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.full_name?.charAt(0) ?? "?"}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.full_name ?? "Sin nombre"}</Text>
        <Text style={styles.role}>
          {roleLabels[profile?.role ?? ""] ?? profile?.role ?? "Sin rol"}
        </Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Documento</Text>
          <Text style={styles.infoValue}>
            {profile?.document_number ?? "—"}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>—</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    alignItems: "center",
    padding: 24,
    paddingBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#ffffff",
  },
  name: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 4,
  },
  role: {
    fontSize: 14,
    color: "#64748b",
  },
  infoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  infoLabel: {
    fontSize: 14,
    color: "#64748b",
  },
  infoValue: {
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "500",
  },
  logoutButton: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 20,
    alignItems: "center",
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#dc2626",
  },
});
