const awsStateEl = document.getElementById("awsState");
const awsDot = document.getElementById("awsDot");
const sshStateEl = document.getElementById("sshState");
const sshDot = document.getElementById("sshDot");
const statusErrorsEl = document.getElementById("statusErrors");
const sshHostEl = document.getElementById("sshHost");
const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatStatus = document.getElementById("chatStatus");
const sessionMetaEl = document.getElementById("sessionMeta");
const sessionLogEl = document.getElementById("sessionLog");
const runMetaEl = document.getElementById("runMeta");
const runLogEl = document.getElementById("runLog");
const logsDrawer = document.getElementById("logsDrawer");

// Debug: Check if elements are found
console.log("Chat elements found:", {
  chatInput: !!chatInput,
  chatSendBtn: !!chatSendBtn,
  chatStatus: !!chatStatus,
  messagesEl: !!messagesEl
});

let currentSessionFile = null;
let messageHistory = [];
let pendingMessages = []; // Track messages sent but not yet confirmed by server

async function getJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

function updateStatus(state, isOk) {
  const dot = state === "aws" ? awsDot : sshDot;
  const text = state === "aws" ? awsStateEl : sshStateEl;
  
  if (isOk) {
    dot.className = "status-dot active";
    text.textContent = state === "aws" ? "running" : "connected";
    text.style.color = "var(--accent)";
  } else {
    dot.className = "status-dot error";
    text.textContent = "down";
    text.style.color = "var(--error)";
  }
}

function extractTextContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  
  // Handle arrays (common in assistant messages)
  if (Array.isArray(content)) {
    if (content.length === 0) return "";
    
    const extracted = content.map(item => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null) {
        // Extract text content from various types
        if (item.type === "text" && item.text) {
          return item.text;
        }
        // Skip thinking blocks (internal reasoning)
        if (item.type === "thinking") {
          return "";
        }
        // Skip tool calls and results
        if (item.type === "tool_call" || item.type === "tool_result" || item.type === "toolCall") {
          return "";
        }
        // Handle text field directly
        if (item.text) return item.text;
        return "";
      }
      return "";
    }).filter(Boolean);
    
    return extracted.join(" ").trim();
  }
  
  // Handle objects
  if (typeof content === "object" && content !== null) {
    if (content.text && typeof content.text === "string") {
      return content.text;
    }
    return "";
  }
  
  return "";
}

function parseSessionLines(lines, maxMessages = 50) {
  const messages = [];
  const seenIds = new Set();
  
  console.log("parseSessionLines called with", lines.length, "lines");
  
  // Process in chronological order (oldest to newest)
  for (const line of lines) {
    if (!line.trim()) continue;
    if (messages.length >= maxMessages) break;
    
    try {
      const obj = JSON.parse(line);
      
      // Skip if we've seen this ID before
      if (obj.id && seenIds.has(obj.id)) continue;
      if (obj.id) seenIds.add(obj.id);
      
      // Clawdbot format: {type: "message", message: {role, content}}
      if (obj.type === "message" && obj.message) {
        const role = obj.message.role || "unknown";
        const rawContent = obj.message.content;
        const content = extractTextContent(rawContent);
        
        console.log(`Parsed message: role=${role}, content.length=${content?.length}, raw=`, typeof rawContent, Array.isArray(rawContent) ? rawContent.length : '');
        
        // Skip system/gateway metadata messages
        if (role === "system" && content) {
          // Skip gateway connection messages
          if (content.includes("gateway connected") || 
              content.includes("System:") ||
              content.includes("WhatsApp") || 
              content.includes("Telegram") ||
              content.includes("message_id:") ||
              content.includes("id:") && content.includes("UTC") ||
              /^\[Telegram/.test(content) ||
              /^\[.*\d+.*UTC\]/.test(content)) {
            continue;
          }
        }
        // Extract actual message content from Telegram/Dashboard metadata wrapper
        let displayContent = content;
        if (role === "user" && content) {
          // Check if this is a Telegram or Dashboard formatted message
          const metadataMatch = content.match(/\[(Telegram|Dashboard)[^\]]*\]\s*(.+?)(?:\n\[message_id:\s*\d+\])?$/s);
          if (metadataMatch && metadataMatch[2]) {
            // Extract the actual message after the metadata
            displayContent = metadataMatch[2].trim();
            console.log("Extracted message content:", displayContent);
          }
        }
        
        // Always show user and assistant messages (even if content is empty initially)
        if (role === "user" || role === "assistant") {
          messages.push({ 
            id: obj.id,
            role, 
            content: displayContent || "", 
            timestamp: obj.timestamp 
          });
        }
      } 
      // Direct format: {role, content}
      else if (obj.role && obj.content !== undefined) {
        const content = extractTextContent(obj.content);
        console.log(`Parsed direct format: role=${obj.role}`);
        // Always show user and assistant messages
        if (obj.role === "user" || obj.role === "assistant") {
          messages.push({ 
            id: obj.id,
            role: obj.role, 
            content: content || "", 
            timestamp: obj.timestamp || new Date().toISOString() 
          });
        }
      } 
      // System message format: {text}
      else if (obj.text) {
        // Skip gateway connection messages
        if (obj.text.includes("gateway connected") || obj.text.includes("WhatsApp") || obj.text.includes("Telegram")) continue;
        messages.push({ 
          id: obj.id,
          role: "system", 
          content: obj.text,
          timestamp: obj.timestamp 
        });
      }
    } catch (e) {
      // Skip non-JSON lines silently
    }
  }
  
  console.log("parseSessionLines returning", messages.length, "messages");
  return messages;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function renderMessages(messages) {
  console.log("Rendering messages:", messages.length, "messages", messages.map(m => ({role: m.role, content: m.content?.substring(0, 50)})));
  
  if (messages.length === 0) {
    messagesEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◈</div>
        <p>Waiting for messages</p>
        <span class="hint">Send a message via Telegram to see it here</span>
      </div>
    `;
    return;
  }
  
  // Filter out consecutive empty assistant messages (keep only latest)
  const filteredMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prevMsg = filteredMessages[filteredMessages.length - 1];
    
    // Skip if this is an empty assistant message and previous was also assistant
    if (msg.role === "assistant" && 
        (!msg.content || msg.content === "(no content)" || msg.content === "(thinking...)") &&
        prevMsg && prevMsg.role === "assistant") {
      continue;
    }
    
    filteredMessages.push(msg);
  }
  
  console.log("Filtered to:", filteredMessages.length, "messages");
  
  // Simple message rendering - just show messages
  const html = filteredMessages.map((msg, index) => {
    const role = msg.role || "unknown";
    const avatar = role === "user" ? "◈" : role === "assistant" ? "◉" : "◎";
    const label = role === "user" ? "You" : role === "assistant" ? "Clawdbot" : "System";
    const time = formatTime(msg.timestamp);
    const delay = Math.min(index * 0.05, 0.5);
    
    let contentClass = "";
    let displayContent = msg.content || "";
    
    if (role === "assistant" && (!displayContent || displayContent.trim() === "")) {
      contentClass = "thinking";
      displayContent = "...";
    }
    
    const html = `
      <div class="message ${role}" style="animation-delay: ${delay}s; display: flex !important;">
        <div class="avatar" title="${label}">${avatar}</div>
        <div class="bubble ${contentClass}">
          ${role === "assistant" && contentClass === "thinking" 
            ? `<span class="dots">${displayContent}</span>`
            : escapeHtml(displayContent)}
          ${time ? `<div class="timestamp">${time}</div>` : ''}
        </div>
      </div>
    `;
    
    console.log(`Rendering ${role} message:`, displayContent?.substring(0, 50));
    return html;
  }).join("");
  
  messagesEl.innerHTML = html;
  console.log("HTML rendered, message count:", filteredMessages.length);
  
  // Scroll to bottom of the chat container
  const chatContainer = document.querySelector('.chat-container');
  if (chatContainer) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function refreshStatus() {
  try {
    const cfg = await getJSON("/api/config");
    sshHostEl.textContent = `${cfg.ssh.user}@${cfg.ssh.host}`;
  } catch (e) {}

  try {
    const data = await getJSON("/api/status");
    updateStatus("aws", data.awsState === "running");
    updateStatus("ssh", data.sshOk);
    statusErrorsEl.textContent = (data.errors || []).join(" | ");
  } catch (e) {
    statusErrorsEl.textContent = e.message;
    updateStatus("aws", false);
    updateStatus("ssh", false);
  }
}

async function refreshLogs() {
  try {
    console.log("refreshLogs: Starting");
    const data = await getJSON("/api/logs");
    console.log("refreshLogs: Got data, sessionLines count:", data.sessionLines?.length);
    
    currentSessionFile = data.sessionFile;
    sessionMetaEl.textContent = data.sessionFile || "none";
    runMetaEl.textContent = data.runFile || "none";
    
    // Update raw logs
    sessionLogEl.textContent = (data.sessionLines || []).join("\n") || "(empty)";
    runLogEl.textContent = (data.runLines || []).join("\n") || "(empty)";
    
    // Parse and render chat messages (limit to last 50)
    const newMessages = parseSessionLines(data.sessionLines || [], 50);
    console.log("refreshLogs: parseSessionLines returned", newMessages.length, "messages");
    
    // Check if messages actually changed by comparing IDs
    const currentIds = messageHistory.map(m => m.id).join(',');
    const newIds = newMessages.map(m => m.id).join(',');
    
    console.log("refreshLogs: Updating messageHistory and rendering");
    messageHistory = newMessages;
    // Clear pending messages that are now confirmed (exist in server response)
    const serverContent = newMessages.map(m => m.content).join('|');
    pendingMessages = pendingMessages.filter(pending => {
      // Keep pending message if its content isn't in server messages yet
      return !serverContent.includes(pending.content);
    });
    // Always render (comparison was causing issues)
    renderMessages([...messageHistory, ...pendingMessages]);
  } catch (e) {
    messagesEl.innerHTML = `
      <div class="message system">
        <div class="avatar">◎</div>
        <div class="bubble">Error loading messages: ${escapeHtml(e.message)}</div>
      </div>
    `;
  }
}

async function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  
  chatSendBtn.disabled = true;
  chatStatus.textContent = "Sending...";
  
  // Add to pending messages (will be merged with server messages)
  const tempId = 'pending-' + Date.now();
  const tempMsg = { 
    id: tempId,
    role: "user", 
    content: message, 
    timestamp: new Date().toISOString(),
    pending: true
  };
  pendingMessages.push(tempMsg);
  // Render immediately with pending message
  renderMessages([...messageHistory, ...pendingMessages]);
  
  try {
    await getJSON("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    
    chatInput.value = "";
    chatStatus.textContent = "Sent";
    
    // Refresh immediately to get the real message with ID from server
    await refreshLogs();
    chatStatus.textContent = "Ready";
    
  } catch (e) {
    chatStatus.textContent = "Failed";
    
    // Remove the pending message on error
    pendingMessages = pendingMessages.filter(m => m.id !== tempId);
    renderMessages([...messageHistory, ...pendingMessages]);
    
    // Show error in chat
    const errorMsg = document.createElement("div");
    errorMsg.className = "message system";
    errorMsg.innerHTML = `
      <div class="avatar">◎</div>
      <div class="bubble">Failed to send: ${escapeHtml(e.message)}</div>
    `;
    messagesEl.appendChild(errorMsg);
  } finally {
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
}

// Event Listeners
document.getElementById("startBtn").addEventListener("click", async () => {
  try {
    await getJSON("/api/start", { method: "POST" });
    await refreshStatus();
  } catch (e) {
    alert("Start failed: " + e.message);
  }
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  refreshStatus();
  refreshLogs();
});

document.getElementById("toggleLogs").addEventListener("click", () => {
  logsDrawer.classList.add("open");
});

document.getElementById("closeLogs").addEventListener("click", () => {
  logsDrawer.classList.remove("open");
});

// Close drawer on escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    logsDrawer.classList.remove("open");
  }
});

// Attach event listeners with checks
if (chatSendBtn && chatInput) {
  console.log("Attaching chat event listeners");
  
  chatSendBtn.addEventListener("click", (e) => {
    console.log("Send button clicked");
    sendChatMessage();
  });
  
  chatInput.addEventListener("keydown", (e) => {
    console.log("Key pressed:", e.key);
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      console.log("Enter pressed - sending message");
      sendChatMessage();
    }
  });
  
  // Focus input on load
  chatInput.focus();
} else {
  console.error("Chat elements not found!");
}

async function boot() {
  console.log("Boot: Starting dashboard...");
  await refreshStatus();
  await refreshLogs();
  
  setInterval(() => {
    console.log("Auto-refresh: Fetching updates...");
    refreshStatus();
    refreshLogs();
  }, 3000); // Refresh every 3 seconds
}

console.log("App.js loaded, starting boot...");
boot();
