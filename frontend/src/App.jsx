import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Documents from './components/Documents'
import './App.css'

const createConversation = () => ({
  id: crypto.randomUUID(),
  title: 'New conversation',
  messages: [],
})

function App() {
  // --------------------------------------------------
  // Authentication
  // --------------------------------------------------

  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setSession(session)
      setAuthLoading(false)
    }

    getSession()
  }, [])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // --------------------------------------------------
  // State
  // --------------------------------------------------

  const [message, setMessage] = useState('')

const [conversations, setConversations] = useState([])
const [activeWorkspace, setActiveWorkspace] = useState(
  () => localStorage.getItem('aroha_active_workspace') || 'conversations'
)

  useEffect(() => {
  localStorage.setItem(
    'aroha_active_workspace',
    activeWorkspace
  )
}, [activeWorkspace])
  const [activeConversationId, setActiveConversationId] =
  useState(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingConversationId, setEditingConversationId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingMessageContent, setEditingMessageContent] = useState('')
  const [regeneratingMessageId, setRegeneratingMessageId] = useState(null)

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('aroha_theme') || 'dark'
  })

  const messagesEndRef = useRef(null)

  const activeConversation = conversations.find(
    (conversation) =>
      conversation.id === activeConversationId
  )

  const messages = activeConversation?.messages || []

  // --------------------------------------------------
  // Theme
  // --------------------------------------------------

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      theme
    )

    localStorage.setItem('aroha_theme', theme)
  }, [theme])

  // --------------------------------------------------
  // Local conversation persistence
  // --------------------------------------------------
useEffect(() => {
  if (!session?.user?.id) {
    return
  }

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', session.user.id)
      .order('updated_at', {
        ascending: false,
      })

    if (error) {
      console.error(
        'Could not load conversations:',
        error
      )
      return
    }

    const loadedConversations = (data || []).map(
      (conversation) => ({
        ...conversation,
        messages: [],
      })
    )

    setConversations(loadedConversations)

    if (loadedConversations.length > 0) {
      setActiveConversationId(
        loadedConversations[0].id
      )
    }
  }

  loadConversations()
}, [session])  // --------------------------------------------------
  // Make sure an active conversation exists
  // --------------------------------------------------
  useEffect(() => {
  const activeExists = conversations.some(
    (conversation) =>
      conversation.id === activeConversationId
  )

  if (activeExists) {
    return
  }

  if (conversations.length > 0) {
    setActiveConversationId(conversations[0].id)
  }
}, [conversations, activeConversationId])

useEffect(() => {
  if (!activeConversationId || !session?.user?.id) {
    return
  }

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq(
        'conversation_id',
        activeConversationId
      )
      .eq('user_id', session.user.id)
      .order('created_at', {
        ascending: true,
      })

    if (error) {
      console.error(
        'Could not load messages:',
        error
      )
      return
    }

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              messages: data || [],
            }
          : conversation
      )
    )
  }

  loadMessages()
}, [activeConversationId, session])

  // --------------------------------------------------
  // Auto-scroll
  // --------------------------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages, loading])

  // --------------------------------------------------
  // Conversation actions
  // --------------------------------------------------

  const handleNewConversation = async () => {
  if (!session?.user?.id) {
    return
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: session.user.id,
      title: 'New conversation',
    })
    .select()
    .single()

  if (error) {
    console.error(
      'Could not create conversation:',
      error
    )
    return
  }

  const newConversation = {
    ...data,
    messages: [],
  }

  setConversations((current) => [
    newConversation,
    ...current,
  ])

  setActiveConversationId(newConversation.id)
  setMessage('')
}
  const handleSelectConversation = (conversationId) => {
    setActiveConversationId(conversationId)
    setMessage('')
  }

  const handleDeleteConversation = async (conversationId) => {
  const confirmed = window.confirm(
    'Delete this conversation and all its messages? This cannot be undone.'
  )

  if (!confirmed) return

  // Delete this user's messages first.
  const { error: messagesError } = await supabase
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', session.user.id)

  if (messagesError) {
    console.error('Could not delete messages:', messagesError)
    alert('Could not delete conversation messages.')
    return
  }

  // Delete the conversation itself.
  const { error: conversationError } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', session.user.id)

  if (conversationError) {
    console.error('Could not delete conversation:', conversationError)
    alert('Could not delete conversation.')
    return
  }

  const remaining = conversations.filter(
    (conversation) => conversation.id !== conversationId
  )

  setConversations(remaining)

  if (activeConversationId === conversationId) {
    setActiveConversationId(remaining[0]?.id || null)
    setMessage('')
  }
}

  const filteredConversations = conversations.filter(
  (conversation) =>
    (conversation.title || 'New conversation')
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase())
)

const handleRenameConversation = async (conversationId) => {
  const title = editingTitle.trim()

  if (!title) {
    alert('Conversation title cannot be empty.')
    return
  }

  const { error } = await supabase
    .from('conversations')
    .update({
      title,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('user_id', session.user.id)

  if (error) {
    console.error('Rename failed:', error)
    alert('Could not rename conversation.')
    return
  }

  setConversations((current) =>
    current.map((conversation) =>
      conversation.id === conversationId
        ? { ...conversation, title }
        : conversation
    )
  )

  setEditingConversationId(null)
  setEditingTitle('')
}

const handleCopyMessage = async (content, messageId) => {
  try {
    await navigator.clipboard.writeText(content)
    setCopiedMessageId(messageId)

    window.setTimeout(() => {
      setCopiedMessageId((current) =>
        current === messageId ? null : current
      )
    }, 1800)
  } catch (error) {
    console.error('Could not copy message:', error)
    alert('Copy failed. Please try again.')
  }
}


const handleEditMessage = async (messageId) => {
  const editedContent = editingMessageContent.trim()

  if (!editedContent || !session?.user?.id) return

  const conversation = conversations.find(
    (item) => item.id === activeConversationId
  )

  if (!conversation) return

  const messageIndex = conversation.messages.findIndex(
    (item) => item.id === messageId
  )

  if (messageIndex === -1) return

  const originalMessage = conversation.messages[messageIndex]

  if (originalMessage.role !== 'user') return

  const laterMessages = conversation.messages.slice(messageIndex + 1)
  const laterMessageIds = laterMessages
    .map((item) => item.id)
    .filter(Boolean)

  setRegeneratingMessageId(messageId)

  try {
    // Generate the replacement response first.
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ message: editedContent }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    const data = await response.json()

    // Update the original user message.
    const { error: updateError } = await supabase
      .from('messages')
      .update({ content: editedContent })
      .eq('id', messageId)
      .eq('conversation_id', activeConversationId)
      .eq('user_id', session.user.id)

    if (updateError) throw updateError

    // Delete messages that followed the edited prompt.
    if (laterMessageIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('messages')
        .delete()
        .in('id', laterMessageIds)
        .eq('conversation_id', activeConversationId)
        .eq('user_id', session.user.id)

      if (deleteError) throw deleteError
    }

    // Save the new assistant response.
    const {
      data: savedAssistantMessage,
      error: assistantError,
    } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConversationId,
        user_id: session.user.id,
        role: 'assistant',
        content: data.message,
      })
      .select()
      .single()

    if (assistantError) throw assistantError

    // Update the conversation title if its first message changed.
    const newTitle =
      messageIndex === 0
        ? editedContent.slice(0, 40)
        : conversation.title

    if (messageIndex === 0) {
      const { error: titleError } = await supabase
        .from('conversations')
        .update({
          title: newTitle,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeConversationId)
        .eq('user_id', session.user.id)

      if (titleError) throw titleError
    }

    // Update the frontend conversation history.
    setConversations((current) =>
      current.map((item) =>
        item.id === activeConversationId
          ? {
              ...item,
              title: newTitle,
              messages: [
                ...item.messages.slice(0, messageIndex),
                { ...originalMessage, content: editedContent },
                savedAssistantMessage,
              ],
            }
          : item
      )
    )

    setEditingMessageId(null)
    setEditingMessageContent('')
  } catch (error) {
    console.error('Could not edit message:', error)
    alert('Could not edit message. Please try again.')
  } finally {
    setRegeneratingMessageId(null)
  }
}

const handleRegenerateResponse = async (assistantMessage, index) => {
  if (!session?.user?.id || regeneratingMessageId) return

  const previousMessage = messages[index - 1]

  if (!previousMessage || previousMessage.role !== 'user') {
    alert('Could not find the original user message.')
    return
  }

  setRegeneratingMessageId(assistantMessage.id)

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        message: previousMessage.content,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    const data = await response.json()

    const { data: updatedMessage, error } = await supabase
      .from('messages')
      .update({ content: data.message })
      .eq('id', assistantMessage.id)
      .eq('conversation_id', activeConversationId)
      .eq('user_id', session.user.id)
      .select()
      .single()

    if (error) throw error

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              messages: conversation.messages.map((item) =>
                item.id === assistantMessage.id
                  ? updatedMessage
                  : item
              ),
            }
          : conversation
      )
    )
  } catch (error) {
    console.error('Could not regenerate response:', error)
    alert('Could not regenerate response. Please try again.')
  } finally {
    setRegeneratingMessageId(null)
  }
}


  // --------------------------------------------------
  // Chat helpers
  // --------------------------------------------------

  const addMessageToConversation = (
    conversationId,
    newMessage
  ) => {
    setConversations((currentConversations) =>
      currentConversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              messages: [
                ...conversation.messages,
                newMessage,
              ],
            }
          : conversation
      )
    )
  }

  // --------------------------------------------------
  // Chat submit
  // --------------------------------------------------

  const handleSubmit = async (event) => {
  event.preventDefault()

  if (
    !message.trim() ||
    loading ||
    !activeConversationId ||
    !session?.user?.id
  ) {
    return
  }

  const userMessage = message.trim()
  const conversationId = activeConversationId

  const currentConversation = conversations.find(
    (conversation) =>
      conversation.id === conversationId
  )

  const isFirstMessage =
    currentConversation?.messages.length === 0

  const conversationTitle = isFirstMessage
    ? userMessage.slice(0, 40)
    : currentConversation?.title || 'New conversation'

  setMessage('')
  setLoading(true)

  try {
    // ----------------------------------------------
    // 1. Update conversation title
    // ----------------------------------------------

    if (isFirstMessage) {
      const { error: titleUpdateError } =
        await supabase
          .from('conversations')
          .update({
            title: conversationTitle,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
          .eq('user_id', session.user.id)

      if (titleUpdateError) {
        throw titleUpdateError
      }
    }

    // ----------------------------------------------
    // 2. Save user message
    // ----------------------------------------------

    const {
      data: savedUserMessage,
      error: userMessageError,
    } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: session.user.id,
        role: 'user',
        content: userMessage,
      })
      .select()
      .single()

    if (userMessageError) {
      throw userMessageError
    }

    // ----------------------------------------------
    // 3. Update UI with user message
    // ----------------------------------------------

    setConversations((currentConversations) =>
      currentConversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              title: conversationTitle,
              messages: [
                ...conversation.messages,
                savedUserMessage,
              ],
            }
          : conversation
      )
    )

    // ----------------------------------------------
    // 4. Ask backend for AROHA response
    // ----------------------------------------------

    const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({
    message: userMessage,
  }),
})

    if (!response.ok) {
      throw new Error(
        `HTTP error: ${response.status}`
      )
    }

    const data = await response.json()

    // ----------------------------------------------
    // 5. Save AROHA response
    // ----------------------------------------------

    const {
      data: savedAssistantMessage,
      error: assistantMessageError,
    } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: session.user.id,
        role: 'assistant',
        content: data.message,
      })
      .select()
      .single()

    if (assistantMessageError) {
      throw assistantMessageError
    }

    // ----------------------------------------------
    // 6. Update UI with AROHA response
    // ----------------------------------------------

    addMessageToConversation(
      conversationId,
      savedAssistantMessage
    )
  } catch (error) {
    console.error(
      'Could not complete chat request:',
      error
    )

    addMessageToConversation(
      conversationId,
      {
        role: 'assistant',
        content:
          'Sorry, something went wrong. Please try again.',
      }
    )
  } finally {
    setLoading(false)
  }
}

  // --------------------------------------------------
  // Quick actions
  // --------------------------------------------------

  const handleQuickAction = (prompt) => {
    setMessage(prompt)
  }

  // --------------------------------------------------
  // Authentication loading
  // --------------------------------------------------

  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-mark">✦</div>
        <p>Loading AROHA...</p>
      </div>
    )
  }

  // --------------------------------------------------
  // Authentication screen
  // --------------------------------------------------

  if (!session) {
    return <Auth />
  }

  // --------------------------------------------------
  // Main application
  // --------------------------------------------------

  return (
    <div className="app">

      {/* Sidebar */}

      <aside className="sidebar">

        <div className="brand">
          <div className="brand-mark">✦</div>
          <span>AROHA</span>
        </div>

        <button
          className="new-chat"
          onClick={handleNewConversation}
        >
          <span>＋</span>
          New conversation
        </button>

        <div className="sidebar-section">
          <p className="section-title">
            WORKSPACE
          </p>

          <button
  className={`sidebar-item ${
    activeWorkspace === 'conversations'
      ? 'active'
      : ''
  }`}
  onClick={() => setActiveWorkspace('conversations')}
>
  <span>◈</span>
  Conversations
</button>

<button
  className={`sidebar-item ${
    activeWorkspace === 'search'
      ? 'active'
      : ''
  }`}
  onClick={() => setActiveWorkspace('search')}
>
  <span>⌕</span>
  Search
</button>

<button
  className={`sidebar-item ${
    activeWorkspace === 'documents'
      ? 'active'
      : ''
  }`}
  onClick={() => setActiveWorkspace('documents')}
>
  <span>▣</span>
  Documents
</button>
        </div>

       {activeWorkspace === 'conversations' && (
  <div className="conversation-list">

    <input
      className="conversation-search"
      type="search"
      placeholder="Search conversations..."
      value={searchQuery}
      onChange={(event) =>
        setSearchQuery(event.target.value)
      }
    />

    {filteredConversations.length === 0 ? (
      <p className="conversation-empty">
        {searchQuery
          ? 'No conversations found.'
          : 'No conversations yet.'}
      </p>
    ) : (
      filteredConversations.map((conversation) => (
        <div
          key={conversation.id}
          className={`conversation-row ${
            conversation.id === activeConversationId
              ? 'active'
              : ''
          }`}
        >
          {editingConversationId === conversation.id ? (
            <form
              className="conversation-rename-form"
              onSubmit={(event) => {
                event.preventDefault()
                handleRenameConversation(conversation.id)
              }}
            >
              <input
                autoFocus
                value={editingTitle}
                onChange={(event) =>
                  setEditingTitle(event.target.value)
                }
                maxLength={80}
                aria-label="Conversation title"
              />

              <button type="submit" title="Save title">
                ✓
              </button>

              <button
                type="button"
                title="Cancel"
                onClick={() => {
                  setEditingConversationId(null)
                  setEditingTitle('')
                }}
              >
                ×
              </button>
            </form>
          ) : (
            <>
              <button
                className="conversation-item"
                onClick={() =>
                  handleSelectConversation(conversation.id)
                }
              >
                {conversation.title || 'New conversation'}
              </button>

              <button
                className="conversation-action"
                title="Rename conversation"
                aria-label="Rename conversation"
                onClick={() => {
                  setEditingConversationId(conversation.id)
                  setEditingTitle(conversation.title || '')
                }}
              >
                ✎
              </button>

              <button
  className="conversation-action conversation-delete"
  title="Delete conversation"
  aria-label="Delete conversation"
  onClick={() =>
    handleDeleteConversation(conversation.id)
  }
>
  ×
</button>
            </>
          )}
        </div>
      ))
    )}
  </div>
)}
        <div className="sidebar-bottom">

          <button className="sidebar-item">
            <span>⚙</span>
            Settings
          </button>

          <div className="profile">
            <div className="avatar">
              {(
                session?.user?.email?.[0] || 'A'
              ).toUpperCase()}
            </div>

            <div className="profile-info">
              <strong>
                {session?.user?.email || 'User'}
              </strong>

              <small>Signed in</small>
            </div>
          </div>

          <button
            className="sign-out-button"
            onClick={async () => {
              await supabase.auth.signOut()
            }}
          >
            <span>↪</span>
            Sign out
          </button>

        </div>

      </aside>

      {/* Main */}

      <main className="main">

        <header className="topbar">

          <div className="mobile-brand">
            ✦ AROHA
          </div>

          <div className="topbar-actions">

            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() =>
                setTheme((current) =>
                  current === 'dark'
                    ? 'light'
                    : 'dark'
                )
              }
            >
              {theme === 'dark' ? '☀' : '◐'}
            </button>

            <button
              className="icon-button"
              aria-label="Settings"
            >
              ⚙
            </button>

          </div>

        </header>

        {/* Welcome */}

{activeWorkspace === 'conversations' && (
  <>
    {/* Welcome */}

    {messages.length === 0 && (          <section className="welcome">

            <div className="welcome-icon">
              ✦
            </div>

            <p className="eyebrow">
              YOUR PERSONAL AI WORKSPACE
            </p>

            <h1>
              What would you like
              <br />
              to work on today?
            </h1>

            <p className="subtitle">
              Learn, create, explore, and get things
              done with AROHA.
            </p>

            <div className="quick-actions">

              <button
                onClick={() =>
                  handleQuickAction(
                    'Teach me something interesting.'
                  )
                }
              >
                <span>✦</span>

                <div>
                  <strong>
                    Learn something
                  </strong>

                  <small>
                    Understand a topic or concept
                  </small>
                </div>
              </button>

              <button
                onClick={() =>
                  handleQuickAction(
                    'Help me build something.'
                  )
                }
              >
                <span>⌘</span>

                <div>
                  <strong>
                    Build something
                  </strong>

                  <small>
                    Code, plan, or create
                  </small>
                </div>
              </button>

              <button
                onClick={() =>
                  handleQuickAction(
                    'Help me explore an idea.'
                  )
                }
              >
                <span>◈</span>

                <div>
                  <strong>
                    Explore an idea
                  </strong>

                  <small>
                    Brainstorm and discover
                  </small>
                </div>
              </button>

            </div>

          </section>
        )}

        {/* Chat history */}

        
{messages.length > 0 && (
  <div className="chat-history">
    {messages.map((item, index) => (
      <div
        key={item.id || index}
        className={`chat-message ${item.role}`}
      >
        <div className="message-label">
          {item.role === 'user' ? 'You' : 'AROHA'}
        </div>

        {editingMessageId === item.id ? (
          <div className="message-edit-form">
            <textarea
              value={editingMessageContent}
              onChange={(event) =>
                setEditingMessageContent(event.target.value)
              }
              rows={3}
            />

            <div className="message-actions">
              <button
                className="edit-message-button"
                onClick={() => handleEditMessage(item.id)}
                disabled={
                  !editingMessageContent.trim() ||
                  regeneratingMessageId !== null
                }
              >
                Save & regenerate
              </button>

              <button
                className="copy-message-button"
                onClick={() => {
                  setEditingMessageId(null)
                  setEditingMessageContent('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p>{item.content}</p>
        )}

        {item.role === 'user' && editingMessageId !== item.id && (
          <button
            className="copy-message-button"
            onClick={() => {
              setEditingMessageId(item.id)
              setEditingMessageContent(item.content)
            }}
            disabled={regeneratingMessageId !== null}
          >
            Edit message
          </button>
        )}

        {item.role === 'assistant' && (
          <div className="message-actions">
            <button
              className="copy-message-button"
              onClick={() =>
                handleCopyMessage(
                  item.content,
                  item.id || `${activeConversationId}-${index}`
                )
              }
            >
              {copiedMessageId ===
              (item.id || `${activeConversationId}-${index}`)
                ? '✓ Copied'
                : 'Copy response'}
            </button>

            <button
              className="copy-message-button"
              onClick={() =>
                handleRegenerateResponse(item, index)
              }
              disabled={regeneratingMessageId !== null}
            >
              {regeneratingMessageId === item.id
                ? 'Regenerating...'
                : 'Regenerate'}
            </button>
          </div>
        )}
      </div>
    ))}

    {loading && (
      <div className="chat-message assistant">
        <div className="message-label">AROHA</div>
        <p className="typing-indicator">
          <span />
          <span />
          <span />
        </p>
      </div>
    )}

    <div ref={messagesEndRef} />
  </div>
)}


        {/* Composer */}

        <form
          className="chat-box"
          onSubmit={handleSubmit}
        >

          <textarea
            value={message}
            onChange={(event) =>
              setMessage(event.target.value)
            }
            placeholder="Ask AROHA anything..."
            rows="1"
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey
              ) {
                event.preventDefault()
                handleSubmit(event)
              }
            }}
          />

          <div className="input-footer">

            <div className="input-tools">

              <button
                type="button"
                aria-label="Attach file"
              >
                ＋
              </button>

              <span>
                Shift + Enter for a new line
              </span>

            </div>

            <button
              type="submit"
              className="send-button"
              disabled={
                !message.trim() || loading
              }
              aria-label="Send message"
            >
              ↑
            </button>

          </div>

        </form>

        <p className="disclaimer">
  AROHA can make mistakes. Check important
  information.
</p>

  </>
)}

{activeWorkspace === 'documents' && (
  <Documents />
)}

</main>

    </div>
  )
}

export default App