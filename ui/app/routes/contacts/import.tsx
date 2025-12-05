import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

interface ImportPreview {
  contacts: ParsedContact[];
  duplicates: DuplicateMatch[];
  validation: ValidationResult;
  totalRows: number;
}

interface ImportAction {
  action: 'skip' | 'update' | 'create';
  parsedContact: ParsedContact;
  existingContactId?: string;
}

export const Route = createFileRoute('/contacts/import')({
  component: ImportComponent,
});

function ImportComponent() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [actions, setActions] = useState<Map<string, ImportAction>>(new Map());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(null);
      setImportResult(null);
      setActions(new Map());
    }
  };

  const handlePreview = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to parse CSV'}`);
        return;
      }

      const data: ImportPreview = await response.json();
      setPreview(data);

      // Initialize actions for duplicates
      const initialActions = new Map<string, ImportAction>();
      for (const duplicate of data.duplicates) {
        const key = `${duplicate.parsedContact.rowNumber}`;
        initialActions.set(key, {
          action: 'skip',
          parsedContact: duplicate.parsedContact,
          existingContactId: duplicate.existingContact.id,
        });
      }
      setActions(initialActions);
    } catch (error) {
      console.error('Preview error:', error);
      alert('Failed to preview import');
    } finally {
      setLoading(false);
    }
  };

  const handleActionChange = (rowNumber: number, action: 'skip' | 'update' | 'create', existingContactId?: string) => {
    const key = `${rowNumber}`;
    const parsedContact = preview?.contacts.find(c => c.rowNumber === rowNumber);
    if (!parsedContact) return;

    const newActions = new Map(actions);
    newActions.set(key, {
      action,
      parsedContact,
      existingContactId,
    });
    setActions(newActions);
  };

  const handleImport = async () => {
    if (!preview) return;

    setImporting(true);
    try {
      const actionsArray = Array.from(actions.values());

      const response = await fetch('/api/contacts/import/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contacts: preview.contacts,
          actions: actionsArray,
        }),
      });

      const result = await response.json();
      setImportResult(result);

      if (result.success) {
        // Redirect to contacts list after successful import
        setTimeout(() => {
          window.location.href = '/contacts';
        }, 3000);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import contacts');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <a
          href="/contacts"
          className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          ← Back to Contacts
        </a>
        <h1 className="text-3xl font-bold text-gray-900">Import Contacts from CSV</h1>
        <p className="text-gray-600 mt-2">
          Upload a CSV file to import contacts. Download{' '}
          <a href="/sample-contacts.csv" className="text-blue-600 hover:text-blue-800 underline">
            sample-contacts.csv
          </a>{' '}
          for the correct format.
        </p>
      </div>

      {/* File Upload */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select CSV File
        </label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {file && (
          <div className="mt-4">
            <p className="text-sm text-gray-600">Selected: {file.name}</p>
            <button
              onClick={handlePreview}
              disabled={loading}
              className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Preview Import'}
            </button>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Import Preview</h2>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-gray-900">{preview.totalRows}</div>
                <div className="text-sm text-gray-600">Total Contacts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{preview.contacts.length - preview.duplicates.length}</div>
                <div className="text-sm text-gray-600">New Contacts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{preview.duplicates.length}</div>
                <div className="text-sm text-gray-600">Duplicates Found</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{preview.validation.warnings.length}</div>
                <div className="text-sm text-gray-600">Warnings</div>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {preview.validation.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 mb-2">Validation Warnings</h3>
              <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                {preview.validation.warnings.slice(0, 10).map((warning, idx) => (
                  <li key={idx}>
                    Row {warning.row}, {warning.field}: {warning.message}
                  </li>
                ))}
                {preview.validation.warnings.length > 10 && (
                  <li>... and {preview.validation.warnings.length - 10} more warnings</li>
                )}
              </ul>
            </div>
          )}

          {/* Duplicates */}
          {preview.duplicates.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Duplicate Contacts</h2>
              <p className="text-sm text-gray-600 mb-4">
                The following contacts already exist. Choose an action for each:
              </p>
              <div className="space-y-4">
                {preview.duplicates.map((duplicate) => {
                  const key = `${duplicate.parsedContact.rowNumber}`;
                  const action = actions.get(key)?.action || 'skip';

                  return (
                    <div key={key} className="border rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <div className="text-sm font-medium text-gray-700">New Contact (CSV)</div>
                          <div className="text-sm text-gray-900">
                            {duplicate.parsedContact.full_name || 'Unnamed'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {duplicate.parsedContact.email || 'No email'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-700">Existing Contact</div>
                          <div className="text-sm text-gray-900">
                            {duplicate.existingContact.full_name || 'Unnamed'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {duplicate.existingContact.email || 'No email'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`action-${key}`}
                            value="skip"
                            checked={action === 'skip'}
                            onChange={() => handleActionChange(
                              duplicate.parsedContact.rowNumber,
                              'skip',
                              duplicate.existingContact.id
                            )}
                            className="mr-2"
                          />
                          <span className="text-sm">Skip</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`action-${key}`}
                            value="update"
                            checked={action === 'update'}
                            onChange={() => handleActionChange(
                              duplicate.parsedContact.rowNumber,
                              'update',
                              duplicate.existingContact.id
                            )}
                            className="mr-2"
                          />
                          <span className="text-sm">Update Existing</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name={`action-${key}`}
                            value="create"
                            checked={action === 'create'}
                            onChange={() => handleActionChange(
                              duplicate.parsedContact.rowNumber,
                              'create'
                            )}
                            className="mr-2"
                          />
                          <span className="text-sm">Create New</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Import Button */}
          <div className="flex justify-end gap-4">
            <a
              href="/contacts"
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </a>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import Contacts'}
            </button>
          </div>
        </div>
      )}

      {/* Import Results */}
      {importResult && (
        <div className={`mt-6 rounded-lg p-6 ${importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <h2 className={`text-xl font-semibold mb-4 ${importResult.success ? 'text-green-800' : 'text-red-800'}`}>
            Import {importResult.success ? 'Completed' : 'Failed'}
          </h2>
          <div className="space-y-2 text-sm">
            <div>Imported: {importResult.imported}</div>
            <div>Updated: {importResult.updated}</div>
            <div>Skipped: {importResult.skipped}</div>
            {importResult.errors.length > 0 && (
              <div className="mt-4">
                <div className="font-semibold">Errors:</div>
                <ul className="list-disc list-inside">
                  {importResult.errors.map((error: any, idx: number) => (
                    <li key={idx}>Row {error.row}: {error.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {importResult.success && (
              <div className="mt-4 text-green-700">
                Redirecting to contacts list...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

