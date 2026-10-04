import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

function Documents() {
  const fileInputRef = useRef(null)

  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [readingDocumentId, setReadingDocumentId] =
  useState(null)

  const loadDocuments = async () => {
    setLoading(true)
    setError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setDocuments([])
      setLoading(false)
      return
    }

    const { data, error: documentsError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', {
        ascending: false,
      })

    if (documentsError) {
      console.error(
        'Could not load documents:',
        documentsError
      )
      setError('Could not load your documents.')
      setLoading(false)
      return
    }

    setDocuments(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setUploading(true)
    setError('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('You must be signed in to upload documents.')
      }

      const fileId = crypto.randomUUID()

      const storagePath =
        `${user.id}/${fileId}-${file.name}`

      // 1. Upload the actual file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)

      if (uploadError) {
        throw uploadError
      }

      // 2. Save the file metadata in the documents table
      const { error: databaseError } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          name: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        })

      if (databaseError) {
        // If database insertion fails, remove the uploaded file
        await supabase.storage
          .from('documents')
          .remove([storagePath])

        throw databaseError
      }

      // 3. Refresh the document list
      await loadDocuments()

      // Reset the file input so the same file can be selected again
      event.target.value = ''
    } catch (uploadError) {
      console.error(
        'Could not upload document:',
        uploadError
      )

      setError(
        uploadError.message ||
          'Something went wrong while uploading the document.'
      )
    } finally {
      setUploading(false)
    }
  }
const handleRead = async (document) => {
  setReadingDocumentId(document.id)
  setError('')

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw new Error(
        'You must be signed in to read documents.'
      )
    }

    const response = await fetch(
      `/api/documents/${document.id}/extract`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(
        data.detail ||
          data.error ||
          'Could not read the document.'
      )
    }

    console.log(
      'Extracted document:',
      data
    )

    alert(
      data.text ||
        data.error ||
        'No text could be extracted.'
    )
  } catch (readError) {
    console.error(
      'Could not read document:',
      readError
    )

    setError(
      readError.message ||
        'Something went wrong while reading the document.'
    )
  } finally {
    setReadingDocumentId(null)
  }
}
  const handleDelete = async (document) => {
    const confirmed = window.confirm(
      `Delete "${document.name}"?`
    )

    if (!confirmed) {
      return
    }

    setError('')

    try {
      // 1. Delete the actual file from Storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([document.storage_path])

      if (storageError) {
        throw storageError
      }

      // 2. Delete its metadata from the database
      const { error: databaseError } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id)

      if (databaseError) {
        throw databaseError
      }

      // 3. Update the UI
      setDocuments((currentDocuments) =>
        currentDocuments.filter(
          (item) => item.id !== document.id
        )
      )
    } catch (deleteError) {
      console.error(
        'Could not delete document:',
        deleteError
      )

      setError(
        deleteError.message ||
          'Something went wrong while deleting the document.'
      )
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) {
      return '0 B'
    }

    if (bytes < 1024) {
      return `${bytes} B`
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <section className="documents-workspace">
      <div className="documents-header">
        <div>
          <h1>Documents</h1>
          <p>
            Upload files and keep them available to AROHA
            for future context.
          </p>
        </div>

        <button
          className="documents-upload-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : 'Upload document'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleUpload}
        />
      </div>

      {error && (
        <div className="documents-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="documents-empty-state">
          <p>Loading documents...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="documents-empty-state">
          <div className="documents-empty-icon">
            📄
          </div>

          <h2>No documents yet</h2>

          <p>
            Upload a PDF, DOCX, TXT, or another file to
            start building your AROHA knowledge space.
          </p>

          <button
            className="documents-secondary-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Upload your first document
          </button>
        </div>
      ) : (
        <div className="documents-grid">
          {documents.map((document) => (
            <article
              className="document-card"
              key={document.id}
            >
              <div className="document-card-icon">
                📄
              </div>

              <div className="document-card-content">
                <h3 title={document.name}>
                  {document.name}
                </h3>

                <p>
                  {formatFileSize(document.size_bytes)}
                  {' · '}
                  {new Date(
                    document.created_at
                  ).toLocaleDateString()}
                </p>
              </div>

              <div className="document-card-actions">
  <button
    className="document-read-button"
    type="button"
    onClick={() => handleRead(document)}
    disabled={
      readingDocumentId === document.id
    }
  >
    {readingDocumentId === document.id
      ? 'Reading...'
      : 'Read'}
  </button>

  <button
    className="document-delete-button"
    type="button"
    onClick={() => handleDelete(document)}
    title="Delete document"
  >
    🗑️
  </button>
</div>              
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default Documents