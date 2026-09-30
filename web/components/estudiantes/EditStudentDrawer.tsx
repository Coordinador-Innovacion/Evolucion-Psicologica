"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logClientError, toUserMessage } from "@/lib/errors";
import { buttonClass } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, inputClasses } from "@/components/ui/field";

export type EditableStudent = {
  id: string;
  first_names: string;
  last_names: string;
  birth_date: string | null;
  birth_place: string | null;
  address: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * EST-05 — Drawer para editar datos personales y opcionales
 * (nacimiento, domicilio, contacto) vía update_student (024).
 */
export function EditStudentDrawer({
  student,
  open,
  onClose,
  onSaved,
}: {
  student: EditableStudent;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstNames, setFirstNames] = useState(student.first_names);
  const [lastNames, setLastNames] = useState(student.last_names);
  const [birthDate, setBirthDate] = useState(student.birth_date ?? "");
  const [birthPlace, setBirthPlace] = useState(student.birth_place ?? "");
  const [address, setAddress] = useState(student.address ?? "");
  const [district, setDistrict] = useState(student.district ?? "");
  const [phone, setPhone] = useState(student.phone ?? "");
  const [email, setEmail] = useState(student.email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      setFirstNames(student.first_names);
      setLastNames(student.last_names);
      setBirthDate(student.birth_date ?? "");
      setBirthPlace(student.birth_place ?? "");
      setAddress(student.address ?? "");
      setDistrict(student.district ?? "");
      setPhone(student.phone ?? "");
      setEmail(student.email ?? "");
      setError(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, student]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("update_student", {
        p_student_id: student.id,
        p_first_names: firstNames.trim(),
        p_last_names: lastNames.trim(),
        p_birth_date: birthDate || null,
        p_birth_place: birthPlace.trim() || null,
        p_address: address.trim() || null,
        p_district: district.trim() || null,
        p_phone: phone.trim() || null,
        p_email: email.trim() || null,
      });
      if (error) throw error;
      if (!data?.success) {
        setError(data?.error ?? "No se pudieron actualizar los datos");
        return;
      }
      toast.success("Datos actualizados");
      onSaved();
      onClose();
    } catch (err) {
      logClientError("estudiantes.update", err);
      setError(toUserMessage(err, "No se pudieron actualizar los datos"));
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Editar datos personales">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombres *">
            <input
              type="text"
              value={firstNames}
              onChange={(e) => setFirstNames(e.target.value)}
              className={inputClasses}
              required
            />
          </Field>
          <Field label="Apellidos *">
            <input
              type="text"
              value={lastNames}
              onChange={(e) => setLastNames(e.target.value)}
              className={inputClasses}
              required
            />
          </Field>
          <Field label="Fecha de nacimiento *">
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className={inputClasses}
              required
            />
          </Field>
          <Field label="Lugar de nacimiento">
            <input
              type="text"
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Distrito">
            <input
              type="text"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Teléfono">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Correo" className="sm:col-span-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Domicilio" className="sm:col-span-2">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClasses}
            />
          </Field>
        </div>

        <p className="text-xs text-ink-muted">
          El tipo y número de documento son la identidad del estudiante y no se modifican
          aquí.
        </p>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-line pt-4">
          <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !firstNames.trim() || !lastNames.trim() || !birthDate}
            className={buttonClass("primary", "md")}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
