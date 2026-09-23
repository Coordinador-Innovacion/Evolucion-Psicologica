import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";

export default function NuevaDerivacionScreen() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    student_name: "",
    student_document: "",
    motivo: "",
    resumen: "",
    acciones_previas: "",
  });

  const handleSubmit = () => {
    if (!formData.student_name || !formData.motivo) {
      Alert.alert("Error", "Por favor completa los campos obligatorios");
      return;
    }

    Alert.alert(
      "Confirmar",
      "¿Deseas guardar esta derivación?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Guardar",
          onPress: () => {
            Alert.alert("Éxito", "Derivación registrada correctamente");
            router.back();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Datos del Estudiante</Text>

        <View style={styles.field}>
          <Text style={styles.label}>
            Nombre completo <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={formData.student_name}
            onChangeText={(text) =>
              setFormData({ ...formData, student_name: text })
            }
            placeholder="Nombre y apellido del estudiante"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Documento de identidad</Text>
          <TextInput
            style={styles.input}
            value={formData.student_document}
            onChangeText={(text) =>
              setFormData({ ...formData, student_document: text })
            }
            placeholder="Número de documento"
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Información de la Derivación</Text>

        <View style={styles.field}>
          <Text style={styles.label}>
            Motivo de la derivación <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.motivo}
            onChangeText={(text) =>
              setFormData({ ...formData, motivo: text })
            }
            placeholder="Describe brevemente el motivo de la derivación"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Resumen de la situación</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.resumen}
            onChangeText={(text) =>
              setFormData({ ...formData, resumen: text })
            }
            placeholder="Información adicional relevante"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Acciones previas realizadas</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.acciones_previas}
            onChangeText={(text) =>
              setFormData({ ...formData, acciones_previas: text })
            }
            placeholder="Indica si se realizaron acciones previas"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>Guardar Derivación</Text>
        </TouchableOpacity>
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#475569",
    marginBottom: 6,
  },
  required: {
    color: "#ef4444",
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#1e293b",
  },
  textArea: {
    minHeight: 100,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
    marginBottom: 40,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#64748b",
  },
  submitButton: {
    flex: 1,
    backgroundColor: "#3b82f6",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});
