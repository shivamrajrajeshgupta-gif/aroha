import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const createConversation = () => ({
  id: crypto.randomUUID(),
  title: 'New conversation',
  messages: [],
})

function App() {
    useEffect(() => {
    const testSupabaseConnection = async () => {
      const { error } = await supabase.auth.getSession()

      if (error) {
        console.error('Supabase connection failed:', error)
        return
      }

      console.log('✅ AROHA connected to Supabase')
    }

    testSupabaseConnection()
  }, [])
  const [message, setMessage] = useState('')

  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('aroha_conversations')

    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return [createConversation()]
      }
    }

    return [createConversation()]
  })

  const [activeConversationId, setActiveConversationId] = useState(() => {
    return localStorage.getItem('aroha_active_conversation')
  })

  const [loading, setLoading] = useState(false)

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('aroha_theme') || 'dark'
  })

  const messagesEndRef = useRef(null)

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId
  )

  const messages = activeConversation?.messages || []

  // --------------------------------------------------
  // Theme
  // --------------------------------------------------

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('aroha_theme', theme)
  }, [theme])

  // --------------------------------------------------
  // Conversation persistence
  // --------------------------------------------------

  useEffect(() => {
    localStorage.setItem(
      'aroha_conversations',
      JSON.stringify(conversations)
    )
  }, [conversations])

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem(
        'aroha_active_conversation',
        activeConversationId
      )
    }
  }, [activeConversationId])

  // Make sure an active conversation always exists.
  useEffect(() => {
    const activeExists = conversations.some(
      (conversation) => conversation.id === activeConversationId
    )

    if (activeExists) {
      return
    }

    if (conversations.length > 0) {
      setActiveConversationId(conversations[0].id)
    }
  }, [conversations, activeConversationId])

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

  const handleNewConversation = () => {
    const newConversation = createConversation()

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
  // Chat
  // --------------------------------------------------

  const addMessageToConversation = (conversationId, newMessage) => {
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

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!message.trim() || loading || !activeConversationId) {
      return
    }

    const userMessage = message.trim()

    const userMessageObject = {
      role: 'user',
      content: userMessage,
    }

    // Add user's message immediately.
    setConversations((currentConversations) =>
      currentConversations.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              title:
                conversation.messages.length === 0
                  ? userMessage.slice(0, 40)
                  : conversation.title,
              messages: [
                ...conversation.messages,
                userMessageObject,
              ],
            }
          : conversation
      )
    )

    setMessage('')
    setLoading(true)

    try {
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
        throw new Error(`HTTP error: ${response.status}`)
      }

      const data = await response.json()

      addMessageToConversation(
        activeConversationId,
        {
          role: 'assistant',
          content: data.message,
        }
      )
    } catch (error) {
      console.error(
        'Could not connect to AROHA backend:',
        error
      )

      addMessageToConversation(
        activeConversationId,
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
          <p className="section-title">WORKSPACE</p>

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
                handleSelectConversation(conversation.id)
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
            <div className="avatar">S</div>

            <div>
              <strong>Guest</strong>
              <small>Personal workspace</small>
            </div>
          </div>
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
            <div className="welcome-icon">✦</div>

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
                  <strong>Learn something</strong>
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
                  <strong>Build something</strong>
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
                  <strong>Explore an idea</strong>
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