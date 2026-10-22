import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Plus,
  MessageSquare,
  ArrowRight,
  Bot,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { assistantPrompts, assistantReply } from "../data/demo";
import { useApp } from "../lib/state";
import { PageTitle, Panel, Button, DemoNote } from "../components/ui";
interface Message {
  role: "user" | "assistant";
  text: string;
  to?: string;
  label?: string;
}
export default function Assistant() {
  const { preferences } = useApp();
  const [language, setLanguage] = useState(preferences.language);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<
    { title: string; messages: Message[] }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
  }, [messages, loading]);
  const send = (text = input) => {
    if (loading) return;
    if (!text.trim()) {
      setError("Write a question or choose an example prompt.");
      return;
    }
    if (text.length > 500) {
      setError("Please keep your question under 500 characters.");
      return;
    }
    setError("");
    setMessages((m) => [...m, { role: "user", text: text.trim() }]);
    setInput("");
    setLoading(true);
    timer.current = setTimeout(() => {
      setMessages((m) => [
        ...m,
        { role: "assistant", ...assistantReply(text, language) },
      ]);
      setLoading(false);
    }, 550);
  };
  const newChat = () => {
    if (messages.length)
      setHistory((h) => [{ title: messages[0].text, messages }, ...h]);
    setMessages([]);
    setError("");
  };
  return (
    <>
      <PageTitle
        eyebrow="GROUNDED TAMIL / ENGLISH ASSISTANT"
        title={
          language === "ta"
            ? "உங்கள் பயணத்திற்கு ஒரு சிறிய உதவி."
            : "A little help finding your way."
        }
        description="Ask about sample journeys, accessibility, or the evidence behind the information."
        action={
          <label className="inline-label">
            Response language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="ta">தமிழ்</option>
            </select>
          </label>
        }
      />
      <div className="assistant-layout">
        <aside className="chat-history">
          <Button variant="secondary" onClick={newChat} disabled={loading}>
            <Plus size={16} />
            New conversation
          </Button>
          <span className="eyebrow">THIS SESSION</span>
          {history.length ? (
            history.map((h, i) => (
              <button
                className="history-item"
                key={i}
                disabled={loading}
                onClick={() => {
                  setMessages(h.messages);
                  setError("");
                }}
              >
                <MessageSquare size={16} />
                <span>{h.title}</span>
              </button>
            ))
          ) : (
            <p className="muted">
              Your conversations will appear here while this session is open.
            </p>
          )}
          <div className="assistant-scope">
            <Bot size={25} />
            <strong>Useful, within its limits.</strong>
            <p>
              This local assistant matches a small response catalogue. It has no
              LLM, live network access, or real-time knowledge.
            </p>
            <Link to="/app/limitations">
              Understand the demo <ArrowRight size={14} />
            </Link>
          </div>
        </aside>
        <Panel className="chat-main">
          <div className="chat-top">
            <span>
              <Sparkles size={17} />
              TransitTrack guide
            </span>
            <span className="demo-pill">LOCAL DEMO ASSISTANT</span>
          </div>
          <div className="conversation" aria-live="polite">
            {!messages.length ? (
              <div className="assistant-welcome">
                <div className="assistant-orb">
                  <Sparkles size={31} />
                </div>
                <span className="eyebrow">
                  A CITY OF QUESTIONS. START WITH YOURS.
                </span>
                <h2>
                  {language === "ta"
                    ? "எங்கே செல்ல வேண்டும்?"
                    : "Where would you like to go?"}
                </h2>
                <p>
                  A clearer route. A lift that needs checking.
                  <br />A little context before you leave.
                </p>
                <div className="prompt-grid">
                  {(language === "ta"
                    ? [
                        "படிக்கட்டுகள் குறைவாக உள்ள வழியை காட்டு.",
                        "Show the most verified route.",
                        "Is the lift at this station verified?",
                        "Why is this timetable uncertain?",
                      ]
                    : assistantPrompts
                  ).map((p) => (
                    <button key={p} onClick={() => send(p)}>
                      {p}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div className={`chat-message ${m.role}`} key={i}>
                  <span className="message-avatar">
                    {m.role === "assistant" ? <Sparkles size={16} /> : "Y"}
                  </span>
                  <div>
                    <small>
                      {m.role === "assistant"
                        ? "TransitTrack · local demonstration"
                        : "You"}
                    </small>
                    <p>{m.text}</p>
                    {m.to && (
                      <Link className="chat-action" to={m.to}>
                        {m.label}
                        <ArrowRight size={15} />
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="assistant-loading" role="status">
                <Sparkles size={15} />
                <span>Looking up a local sample response…</span>
              </div>
            )}
            <div ref={bottom} />
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label className="sr-only" htmlFor="assistant-input">
              Ask a question
            </label>
            <input
              id="assistant-input"
              placeholder={
                language === "ta"
                  ? "உங்கள் பயணம் பற்றி கேளுங்கள்…"
                  : "Ask about a journey or the evidence behind it…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              className="send-button"
              type="submit"
              disabled={loading}
              aria-label="Send message"
            >
              <Send size={19} />
            </button>
          </form>
          {error && (
            <p className="form-error" role="alert">
              <AlertCircle size={15} />
              {error}
            </p>
          )}
          <DemoNote>
            Catalogue responses only. Confirm travel information with the
            relevant operator.
          </DemoNote>
        </Panel>
      </div>
    </>
  );
}
