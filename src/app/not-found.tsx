import Link from "next/link";
export default function NotFound() {
  return (
    <main className="setup">
      <h1>Page not found</h1>
      <Link href="/">Return to QueueFlow</Link>
    </main>
  );
}
