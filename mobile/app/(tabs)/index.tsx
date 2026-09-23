import { View, Text, StyleSheet } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Evolución Psicológica</Text>
      <Text style={styles.subtitle}>Panel del Docente</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Funciones principales</Text>
        <Text style={styles.cardItem}>• Registrar derivaciones</Text>
        <Text style={styles.cardItem}>• Consultar necesidades especiales</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 12,
  },
  cardItem: {
    fontSize: 16,
    color: "#475569",
    marginBottom: 8,
  },
});
