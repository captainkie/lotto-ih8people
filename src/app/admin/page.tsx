import type { Metadata } from "next";
import { AdminForm } from "./admin-form";

export const metadata: Metadata = {
  title: "จัดการข้อมูล (Admin)",
  // The page is password-gated, not secret — but it has no business in an index.
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">จัดการข้อมูล (Admin)</h1>
      <AdminForm />
    </main>
  );
}
