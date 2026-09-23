import { View, Text, StyleSheet, ScrollView } from "react-native";

export default function NecesidadEspecialScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.studentName}>Ana Martínez</Text>
        <Text style={styles.grado}>5° Primaria - Sección A</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Información de Necesidad Especial</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Tipo de condición</Text>
          <Text style={styles.value}>TDAH (Trastorno por Déficit de Atención con Hiperactividad)</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Descripción clínica</Text>
          <Text style={styles.value}>
            Estudiante diagnosticado con TDAH tipo combinado. Presenta dificultades
            de concentración en tareas académicas, impulsividad en el aula y
            dificultad para seguir instrucciones complejas.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Orientación para el docente</Text>
          <Text style={styles.value}>
            Se recomienda: 
            • Sentar al estudiante cerca del docente
            • Dividir las tareas en partes más pequeñas
            • Permitir movimiento breve entre actividades
            • Reforzar positivamente el comportamiento adecuado
            • Evitar corregir públicamente de forma insistente
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Entidad certificadora</Text>
          <Text style={styles.value}>Centro de Diagnóstico Infantil</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Fecha de certificación</Text>
          <Text style={styles.value}>15 de marzo de 2026</Text>
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Información importante</Text>
        <Text style={styles.infoText}>
          Esta información es solo para orientación docente. El contenido clínico
          completo está disponible únicamente para el Psicólogo.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  studentName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 4,
  },
  grado: {
    fontSize: 16,
    color: "#64748b",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
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
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: "#1e293b",
    lineHeight: 24,
  },
  infoBox: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#3b82f6",
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e40af",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#1e40af",
    lineHeight: 20,
  },
});
