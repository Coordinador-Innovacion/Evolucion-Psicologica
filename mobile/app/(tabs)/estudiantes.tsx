import { View, Text, StyleSheet, FlatList } from "react-native";

const MOCK_ESTUDIANTES = [
  {
    id: "1",
    name: "Ana Martínez",
    grado: "5° Primaria",
    tiene_necesidad_especial: true,
    tipo_necesidad: "TDAH",
  },
  {
    id: "2",
    name: "Pedro Sánchez",
    grado: "3° Secundaria",
    tiene_necesidad_especial: false,
    tipo_necesidad: null,
  },
  {
    id: "3",
    name: "Laura Rodríguez",
    grado: "2° Primaria",
    tiene_necesidad_especial: true,
    tipo_necesidad: "Dislexia",
  },
];

export default function EstudiantesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Estudiantes</Text>
      <Text style={styles.subtitle}>Información de necesidades especiales</Text>

      <FlatList
        data={MOCK_ESTUDIANTES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.studentName}>{item.name}</Text>
              {item.tiene_necesidad_especial && (
                <View style={styles.needsBadge}>
                  <Text style={styles.needsBadgeText}>NE</Text>
                </View>
              )}
            </View>
            <Text style={styles.grado}>{item.grado}</Text>
            {item.tiene_necesidad_especial && (
              <View style={styles.needsInfo}>
                <Text style={styles.needsLabel}>Tipo:</Text>
                <Text style={styles.needsValue}>{item.tipo_necesidad}</Text>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No hay estudiantes registrados</Text>
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
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    padding: 20,
    paddingBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    paddingHorizontal: 20,
    marginBottom: 16,
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
    marginBottom: 4,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
  },
  needsBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  needsBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400e",
  },
  grado: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 8,
  },
  needsInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    padding: 10,
    borderRadius: 8,
  },
  needsLabel: {
    fontSize: 14,
    color: "#64748b",
    marginRight: 8,
  },
  needsValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1e293b",
  },
  empty: {
    textAlign: "center",
    color: "#94a3b8",
    marginTop: 40,
    fontSize: 16,
  },
});
