import { View, Text, StyleSheet, FlatList } from "react-native";
import { useRouter } from "expo-router";

const MOCK_DERIVACIONES = [
  {
    id: "1",
    student_name: "María García",
    date: "2026-09-15",
    motivo: "Dificultades de concentración en clase",
    estado: "pendiente",
  },
  {
    id: "2",
    student_name: "Carlos López",
    date: "2026-09-10",
    motivo: "Conflictos con compañeros",
    estado: "en_revision",
  },
];

export default function DerivacionesScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Derivaciones</Text>
        <Text
          style={styles.newButton}
          onPress={() => router.push("/derivacion/nueva")}
        >
          + Nueva
        </Text>
      </View>

      <FlatList
        data={MOCK_DERIVACIONES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.studentName}>{item.student_name}</Text>
              <Text
                style={[
                  styles.status,
                  item.estado === "pendiente"
                    ? styles.statusPendiente
                    : styles.statusEnRevision,
                ]}
              >
                {item.estado === "pendiente" ? "Pendiente" : "En revisión"}
              </Text>
            </View>
            <Text style={styles.date}>{item.date}</Text>
            <Text style={styles.motivo}>{item.motivo}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No hay derivaciones registradas</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
  },
  newButton: {
    fontSize: 16,
    color: "#3b82f6",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
  },
  status: {
    fontSize: 12,
    fontWeight: "500",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPendiente: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
  },
  statusEnRevision: {
    backgroundColor: "#dbeafe",
    color: "#1e40af",
  },
  date: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 4,
  },
  motivo: {
    fontSize: 14,
    color: "#475569",
  },
  empty: {
    textAlign: "center",
    color: "#94a3b8",
    marginTop: 40,
    fontSize: 16,
  },
});
