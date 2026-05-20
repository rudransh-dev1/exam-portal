"use client";

import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, X, RefreshCw, Key } from "lucide-react";
import { adminFetch } from "@/lib/api";

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
      const data: any = await adminFetch("/py-api/admin/faculty");
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

        const res: any = await adminFetch(`/py-api/admin/faculty/${editingFaculty.id}`, {
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

        const res: any = await adminFetch("/py-api/admin/faculty", {
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
      await adminFetch(`/py-api/admin/faculty/${id}`, {
        method: "DELETE",
      });
      fetchFaculty();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  if (loading && faculty.length === 0) {
    return (
      <div className="flex justify-center items-center h-64 text-[var(--accent-primary)]">
        <RefreshCw className="animate-spin w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Faculty Management</h2>
          <p className="text-[var(--text-secondary)]">Create and manage faculty accounts who can host exams and events.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-[var(--accent-primary)] text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-[var(--accent-hover)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Faculty
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)] text-[var(--text-secondary)]">
            <tr>
              <th className="p-4 font-medium">Name</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Department</th>
              <th className="p-4 font-medium">Joined</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {faculty.map((fac) => (
              <tr key={fac.id} className="hover:bg-[var(--bg-tertiary)] transition-colors">
                <td className="p-4 text-[var(--text-primary)] font-medium">{fac.name}</td>
                <td className="p-4 text-[var(--text-secondary)]">{fac.email}</td>
                <td className="p-4 text-[var(--text-secondary)]">
                  {fac.department ? (
                    <span className="bg-[var(--bg-primary)] px-2 py-1 rounded text-xs border border-[var(--border-color)]">
                      {fac.department}
                    </span>
                  ) : (
                    <span className="text-gray-500 italic">None</span>
                  )}
                </td>
                <td className="p-4 text-[var(--text-secondary)] text-sm">
                  {new Date(fac.created_at).toLocaleDateString()}
                </td>
                <td className="p-4 flex justify-end gap-2">
                  <button
                    onClick={() => handleOpenModal(fac)}
                    className="p-2 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10 rounded-lg transition-colors"
                    title="Edit Faculty"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(fac.id)}
                    className="p-2 text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete Faculty"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {faculty.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[var(--text-secondary)]">
                  No faculty members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-[var(--border-color)]">
              <h3 className="text-xl font-bold text-[var(--text-primary)]">
                {editingFaculty ? "Edit Faculty" : "Add Faculty"}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  placeholder="e.g. Dr. Smith"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  disabled={!!editingFaculty}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-50"
                  placeholder="faculty@college.edu"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  placeholder="e.g. Computer Science"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  {editingFaculty ? "New Password (Optional)" : "Password *"}
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-2.5 w-5 h-5 text-[var(--text-secondary)]" />
                  <input
                    type="password"
                    required={!editingFaculty}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg pl-10 pr-4 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    placeholder={editingFaculty ? "Leave blank to keep same" : "Enter secure password"}
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[var(--accent-primary)] text-white px-6 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
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
