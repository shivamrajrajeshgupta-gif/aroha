import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
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
const [activeConversationId, setActiveConversationId] =
  useState(null)
  const [loading, setLoading] = useState(false)

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

          <button className="sidebar-item active">
            <span>◈</span>
            Conversations
          </button>

          <button className="sidebar-item">
            <span>⌕</span>
            Search
          </button>

          <button className="sidebar-item">
            <span>▣</span>
            Documents
          </button>
        </div>

        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`conversation-item ${
                conversation.id === activeConversationId
                  ? 'active'
                  : ''
              }`}
              onClick={() =>
                handleSelectConversation(
                  conversation.id
                )
              }
            >
              {conversation.title}
            </button>
          ))}
        </div>

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

        {messages.length === 0 && (
          <section className="welcome">

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
                key={index}
                className={`chat-message ${item.role}`}
              >
                <div className="message-label">
                  {item.role === 'user'
                    ? 'You'
                    : 'AROHA'}
                </div>

                <p>{item.content}</p>
              </div>
            ))}

            {loading && (
              <div className="chat-message assistant">

                <div className="message-label">
                  AROHA
                </div>

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

      </main>

    </div>
  )
}

export default App