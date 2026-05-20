"use client";

import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, X, RefreshCw, Key } from "lucide-react";
import { adminFetch } from "@/lib/api";
import styles from "./adminTabs.module.css";

type Faculty = {
  id: string;
  name: string;
  email: string;
  department: string;
  created_at: string;
};

export default function FacultyAdminTab() {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    department: "",
    password: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchFaculty();
  }, []);

  const fetchFaculty = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: any = await adminFetch("/admin/faculty");
      setFaculty(data || []);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (fac?: Faculty) => {
    if (fac) {
      setEditingFaculty(fac);
      setFormData({
        name: fac.name,
        email: fac.email,
        department: fac.department || "",
        password: "", // blank, only fill to update
      });
    } else {
      setEditingFaculty(null);
      setFormData({ name: "", email: "", department: "", password: "" });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingFaculty(null);
    setFormData({ name: "", email: "", department: "", password: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingFaculty) {
        // Update
        const payload: any = {
          name: formData.name,
          department: formData.department,
        };
        if (formData.password.trim()) {
          payload.password = formData.password;
        }

        const res: any = await adminFetch(`/admin/faculty/${editingFaculty.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        await fetchFaculty();
        handleCloseModal();
      } else {
        // Create
        if (!formData.password) {
          alert("Password is required for new faculty.");
          setIsSubmitting(false);
          return;
        }

        const res: any = await adminFetch("/admin/faculty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        await fetchFaculty();
        handleCloseModal();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this faculty member?")) return;
    try {
      await adminFetch(`/admin/faculty/${id}`, {
        method: "DELETE",
      });
      fetchFaculty();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  if (loading && faculty.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--accent-primary)' }}>
        <RefreshCw style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Faculty Management</h2>
          <p className={styles.subtitle}>Create and manage faculty accounts who can host exams and events.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className={styles.primaryButton}
        >
          <Plus size={16} />
          Add Faculty
        </button>
      </div>

      {error && (
        <div className={styles.errorBox}>
          {error}
        </div>
      )}

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Email</th>
              <th className={styles.th}>Department</th>
              <th className={styles.th}>Joined</th>
              <th className={styles.th} style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {faculty.map((fac) => (
              <tr key={fac.id} className={styles.tr}>
                <td className={styles.td} style={{ fontWeight: 500 }}>{fac.name}</td>
                <td className={styles.td} style={{ color: 'var(--text-secondary)' }}>{fac.email}</td>
                <td className={styles.td}>
                  {fac.department ? (
                    <span className={styles.badge}>
                      {fac.department}
                    </span>
                  ) : (
                    <span style={{ fontStyle: 'italic', color: '#6b7280' }}>None</span>
                  )}
                </td>
                <td className={styles.td} style={{ fontSize: '0.875rem' }}>
                  {new Date(fac.created_at).toLocaleDateString()}
                </td>
                <td className={styles.td} style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleOpenModal(fac)}
                    className={styles.iconBtn}
                    title="Edit Faculty"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(fac.id)}
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    title="Delete Faculty"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {faculty.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.td} style={{ textAlign: "center", padding: "2rem", color: 'var(--text-secondary)' }}>
                  No faculty members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {editingFaculty ? "Edit Faculty" : "Add Faculty"}
              </h3>
              <button
                onClick={handleCloseModal}
                className={styles.iconBtn}
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={styles.input}
                    placeholder="e.g. Dr. Smith"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Email Address *</label>
                  <input
                    type="email"
                    required
                    disabled={!!editingFaculty}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={styles.input}
                    placeholder="faculty@college.edu"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className={styles.input}
                    placeholder="e.g. Computer Science"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    {editingFaculty ? "New Password (Optional)" : "Password *"}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Key size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                      type="password"
                      required={!editingFaculty}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className={styles.input}
                      style={{ paddingLeft: '40px' }}
                      placeholder={editingFaculty ? "Leave blank to keep same" : "Enter secure password"}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter} style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className={styles.secondaryButton}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={styles.primaryButton}
                >
                  {isSubmitting ? "Saving..." : "Save Faculty"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
