import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

function Documents() {
  const fileInputRef = useRef(null)

  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [readingDocumentId, setReadingDocumentId] =
    useState(null)
  const [error, setError] = useState('')

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

    const { data, error: documentsError } =
      await supabase
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
        throw new Error(
          'You must be signed in to upload documents.'
        )
      }

      const fileId = crypto.randomUUID()

      const storagePath =
        `${user.id}/${fileId}-${file.name}`

      const { error: uploadError } =
        await supabase.storage
          .from('documents')
          .upload(storagePath, file)

      if (uploadError) {
        throw uploadError
      }

      const { error: databaseError } =
        await supabase
          .from('documents')
          .insert({
            user_id: user.id,
            name: file.name,
            storage_path: storagePath,
            mime_type: file.type || null,
            size_bytes: file.size,
          })

      if (databaseError) {
        await supabase.storage
          .from('documents')
          .remove([storagePath])

        throw databaseError
      }

      await loadDocuments()
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

      const responseText = await response.text()

      let data = null

      try {
        data = responseText
          ? JSON.parse(responseText)
          : null
      } catch {
        throw new Error(
          'The server returned an invalid response.'
        )
      }

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            data?.error ||
            'Could not read the document.'
        )
      }

      if (!data) {
        throw new Error(
          'The server returned an empty response.'
        )
      }

      if (data.error) {
        throw new Error(data.error)
      }

      if (!data.text) {
        throw new Error(
          'The document was read, but no text was extracted.'
        )
      }

      console.log(
        'Extracted document:',
        data
      )

      alert(data.text)
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
      const { error: storageError } =
        await supabase.storage
          .from('documents')
          .remove([document.storage_path])

      if (storageError) {
        throw storageError
      }

      const { error: databaseError } =
        await supabase
          .from('documents')
          .delete()
          .eq('id', document.id)

      if (databaseError) {
        throw databaseError
      }

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

  const getFileType = (document) => {
    const mimeType = document.mime_type || ''

    if (mimeType === 'application/pdf') {
      return 'PDF'
    }

    if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return 'DOCX'
    }

    if (mimeType === 'text/plain') {
      return 'TXT'
    }

    return 'FILE'
  }

  const getFileIcon = (document) => {
    const type = getFileType(document)

    if (type === 'PDF') {
      return 'PDF'
    }

    if (type === 'DOCX') {
      return 'DOC'
    }

    if (type === 'TXT') {
      return 'TXT'
    }

    return 'FILE'
  }

  return (
    <section className="documents-workspace">
      <div className="documents-page-header">
        <div>
          <span className="documents-eyebrow">
            KNOWLEDGE SPACE
          </span>

          <h1>Documents</h1>

          <p>
            Keep your files available to AROHA for
            future context.
          </p>
        </div>

        <button
          className="documents-upload-button"
          type="button"
          onClick={() =>
            fileInputRef.current?.click()
          }
          disabled={uploading}
        >
          <span className="upload-button-icon">
            +
          </span>

          {uploading
            ? 'Uploading...'
            : 'Upload document'}
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

      <div className="documents-summary">
        <div>
          <strong>
            {documents.length}
          </strong>

          <span>
            {documents.length === 1
              ? ' document'
              : ' documents'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="documents-empty-state">
          <p>Loading documents...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="documents-empty-state">
          <div className="documents-empty-icon">
            +
          </div>

          <h2>No documents yet</h2>

          <p>
            Upload a PDF, DOCX, TXT, or another file
            to start building your AROHA knowledge
            space.
          </p>

          <button
            className="documents-secondary-button"
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
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
              <div className="document-card-top">
                <div
                  className={`document-file-icon ${getFileType(
                    document
                  ).toLowerCase()}`}
                >
                  {getFileIcon(document)}
                </div>

                <button
                  className="document-delete-button"
                  type="button"
                  onClick={() =>
                    handleDelete(document)
                  }
                  title="Delete document"
                >
                  ×
                </button>
              </div>

              <div className="document-card-content">
                <span className="document-type">
                  {getFileType(document)}
                </span>

                <h3 title={document.name}>
                  {document.name}
                </h3>

                <p>
                  {formatFileSize(
                    document.size_bytes
                  )}
                  {' · '}
                  {new Date(
                    document.created_at
                  ).toLocaleDateString()}
                </p>
              </div>

              <button
                className="document-read-button"
                type="button"
                onClick={() =>
                  handleRead(document)
                }
                disabled={
                  readingDocumentId ===
                  document.id
                }
              >
                {readingDocumentId === document.id
                  ? 'Reading...'
                  : 'Read document'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default Documents