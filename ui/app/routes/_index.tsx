import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        Shared Contacts
      </h1>
      <p className="text-lg text-gray-600 mb-8">
        Manage your shared contact address book
      </p>
      <div className="space-x-4">
        <Link
          to="/contacts"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
          View Contacts
        </Link>
        <Link
          to="/auth/login"
          className="inline-block bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition"
        >
          Login
        </Link>
      </div>
    </div>
  );
}

