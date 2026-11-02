import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-3xl text-forest">Not found</h1>
      <p className="mt-2 text-sm text-stone-600">That page is not in the CRM.</p>
      <Link className="btn mt-4" href="/">Back to the dashboard</Link>
    </div>
  );
}
