"use client"

// WorkwithMe AI Agent Tab
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowUp, Loader2, Copy, Check, RotateCcw, FileText, Code, Sparkles, Bot, X, Download, File, FileImage, FileSpreadsheet, PanelRightOpen, PanelRightClose, MessageSquare, Monitor, FileSpreadsheetIcon, Presentation } from "lucide-react"
import { cn } from "@/lib/utils"
import { DocViewer, DocWizard, type DocData } from "@/components/doc-viewer"
import { SlidesViewer, SlidesWizard, type SlidesData } from "@/components/slides-viewer"

interface Slide {
  id: string
  title: string
  content: string[]
  backgroundColor?: string
  textColor?: string
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  status?: "pending" | "processing" | "completed" | "error" | "complete"
}

interface WorkwithMeFile {
  fileName: string
  fileUrl: string
  mimeType?: string
}

export default function AgentsPage() {
  const [inputValue, setInputValue] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null)

  // Task type options with placeholder text
  const taskTypes = [
    { id: "websites", label: "Websites", icon: Monitor, placeholder: "Create a website for..." },
    { id: "docs", label: "Docs", icon: FileText, placeholder: "Write a document about..." },
    { id: "slides", label: "Slides", icon: Presentation, placeholder: "Create a presentation on..." },
    { id: "sheets", label: "Sheets", icon: FileSpreadsheetIcon, placeholder: "Build a spreadsheet for..." },
  ]
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [docWizardOpen, setDocWizardOpen] = useState(false)
  const [newSlidesWizardOpen, setNewSlidesWizardOpen] = useState(false)
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false)
  const [isGeneratingNewSlides, setIsGeneratingNewSlides] = useState(false)
  const [generatedDocData, setGeneratedDocData] = useState<DocData | null>(null)
  const [generatedSlidesData, setGeneratedSlidesData] = useState<SlidesData | null>(null)
  
  // Results Panel State
  const [showResultsPanel, setShowResultsPanel] = useState(false)
  const [resultsPanelVisible, setResultsPanelVisible] = useState(true)
  const [taskFiles, setTaskFiles] = useState<WorkwithMeFile[]>([])
  const [taskResults, setTaskResults] = useState<string[]>([])
  const [taskCompleted, setTaskCompleted] = useState(false)
  
  // Real-time steps from API
  const [taskSteps, setTaskSteps] = useState<Array<{desc: string, type: string, icon: string}>>([])
  const stepsEndRef = useRef<HTMLDivElement>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [taskSteps])

  // Get icon for file type
  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return <File className="h-4 w-4 text-gray-500" />
    if (mimeType.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />
    if (mimeType.includes('image')) return <FileImage className="h-4 w-4 text-blue-500" />
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return <FileSpreadsheet className="h-4 w-4 text-green-500" />
    if (mimeType.includes('presentation') || mimeType.includes('pptx')) return <FileText className="h-4 w-4 text-orange-500" />
    return <File className="h-4 w-4 text-gray-500" />
  }

  // Handle task execution with API
  const handleSubmit = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    }

    const assistantMessageId = crypto.randomUUID()
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      status: "processing",
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setInputValue("")
    setIsLoading(true)
    setTaskFiles([])
    setTaskResults([])
    setTaskCompleted(false)
    setTaskSteps([])

    try {
      const eventSource = new EventSource(`/api/agent?query=${encodeURIComponent(userMessage.content)}`)
      
      let rawOutput = ""
      let summaryText = ""

      // Listen for step updates (real-time progress)
      eventSource.addEventListener("step", (e) => {
        const data = JSON.parse(e.data)
        setTaskSteps(prev => [...prev, { desc: data.desc, type: data.type, icon: data.icon }])
      })

      eventSource.addEventListener("result", (e) => {
        const data = JSON.parse(e.data)
        rawOutput = data.output
        setTaskResults(prev => [...prev, rawOutput])
      })

      eventSource.addEventListener("file", (e) => {
        const data = JSON.parse(e.data)
        setTaskFiles(prev => {
          if (prev.some(f => f.fileUrl === data.fileUrl)) return prev
          return [...prev, data]
        })
      })

      eventSource.addEventListener("files", (e) => {
        const data = JSON.parse(e.data)
        if (data.files && Array.isArray(data.files)) {
          setTaskFiles(prev => {
            const newFiles = data.files.filter((f: WorkwithMeFile) => 
              !prev.some(existing => existing.fileUrl === f.fileUrl)
            )
            return [...prev, ...newFiles]
          })
        }
      })

      eventSource.addEventListener("summary", (e) => {
        const data = JSON.parse(e.data)
        summaryText = data.text
      })

      eventSource.addEventListener("done", () => {
        eventSource.close()
        
        const finalContent = summaryText || rawOutput || "Task completed successfully."
        
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId 
            ? { ...m, content: finalContent, status: "complete" as const }
            : m
        ))
        
        setIsLoading(false)
        setTaskCompleted(true)
        setShowResultsPanel(true)
        setResultsPanelVisible(true)
      })

      let receivedErrorEvent = false

      eventSource.addEventListener("agent_error", (e: Event) => {
        receivedErrorEvent = true
        eventSource.close()
        let errorMsg = "An error occurred"
        try {
          const msgEvent = e as MessageEvent
          if (msgEvent.data) {
            const data = JSON.parse(msgEvent.data)
            errorMsg = data.message || data.error || errorMsg
          }
        } catch {
          // Ignore parse errors
        }
        
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId 
            ? { ...m, content: errorMsg, status: "error" as const }
            : m
        ))
        
        setIsLoading(false)
      })

      eventSource.onerror = () => {
        eventSource.close()
        
        if (receivedErrorEvent) return
        
        const errorContent = "Connection error: Unable to establish connection. Please check that the API is configured correctly."
        
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId 
            ? { ...m, content: errorContent, status: "error" as const }
            : m
        ))
        
        setIsLoading(false)
      }

    } catch {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRetry = (messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex > 0) {
      const userMessage = messages[messageIndex - 1]
      if (userMessage.role === "user") {
        setInputValue(userMessage.content)
        setMessages(prev => prev.slice(0, messageIndex - 1))
      }
    }
  }

  // Generate document
  const handleGenerateDoc = async (data: { topic: string; audience: string; style: string }) => {
    setIsGeneratingDoc(true)
    setDocWizardOpen(false)
    
    try {
      const response = await fetch("/api/generate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      
      if (!response.ok) throw new Error("Failed to generate document")
      
      const docData = await response.json()
      setGeneratedDocData(docData)
      
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: `Create a document about "${data.topic}"${data.audience ? ` for ${data.audience}` : ""}`,
        timestamp: new Date(),
      }
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I've created a professional document about "${data.topic}". You can view it below, copy sections, or download it as PDF or DOCX.`,
        timestamp: new Date(),
        status: "completed",
      }
      
      setMessages(prev => [...prev, userMessage, assistantMessage])
    } catch (error) {
      console.error("Error generating document:", error)
    } finally {
      setIsGeneratingDoc(false)
    }
  }

  // Generate slides
  const handleGenerateNewSlides = async (data: { topic: string; audience: string; slideCount: string; style: string }) => {
    setIsGeneratingNewSlides(true)
    setNewSlidesWizardOpen(false)
    
    try {
      const response = await fetch("/api/generate-slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      
      if (!response.ok) throw new Error("Failed to generate slides")
      
      const slidesResponse = await response.json()
      
      const styleColors = {
        professional: { bg: "#1e293b", text: "#ffffff" },
        creative: { bg: "#7c3aed", text: "#ffffff" },
        minimal: { bg: "#ffffff", text: "#1e293b" },
        dark: { bg: "#0f172a", text: "#e2e8f0" },
      }
      const colors = styleColors[data.style as keyof typeof styleColors] || styleColors.professional
      
      const slides: Slide[] = slidesResponse.slides.map((slide: { title: string; content: string[] }) => ({
        id: crypto.randomUUID(),
        title: slide.title,
        content: slide.content,
        backgroundColor: colors.bg,
        textColor: colors.text,
      }))
      
      setGeneratedSlidesData({
        topic: data.topic,
        slides,
        style: data.style as SlidesData["style"],
      })
      
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: `Create a ${data.slideCount}-slide presentation about "${data.topic}"${data.audience ? ` for ${data.audience}` : ""}`,
        timestamp: new Date(),
      }
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I've created a ${slides.length}-slide presentation about "${data.topic}". You can view it below, navigate through slides, present in fullscreen, or download it as PPTX.`,
        timestamp: new Date(),
        status: "completed",
      }
      
      setMessages(prev => [...prev, userMessage, assistantMessage])
    } catch (error) {
      console.error("Error generating slides:", error)
    } finally {
      setIsGeneratingNewSlides(false)
    }
  }

  // Example prompts
  const examplePrompts = [
    "Research the latest AI trends and summarize key findings",
    "Analyze competitor pricing strategies",
    "Write a professional email draft for a job application",
    "Create a marketing plan outline for a new product launch",
  ]

  return (
    <div className="flex h-full bg-background">
      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {messages.length === 0 ? (
          // Empty State - Hero Chat Input
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              {/* Hero Title */}
              <div className="mb-8 text-center">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
                  <MessageSquare className="h-7 w-7 text-primary-foreground" />
                </div>
                <h1 className="mb-2 text-3xl font-semibold text-foreground">
                  WorkwithMe AI
                </h1>
                <p className="text-muted-foreground">
                  Your intelligent assistant for research, analysis, and writing tasks
                </p>
              </div>

              {/* Task Type Buttons */}
              <div className="mb-6 flex flex-wrap justify-center gap-2">
                {taskTypes.map((type) => {
                  const Icon = type.icon
                  return (
                    <button
                      key={type.id}
                      onClick={() => setSelectedTaskType(selectedTaskType === type.id ? null : type.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                        selectedTaskType === type.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {type.label}
                      {type.badge && (
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-600">
                          {type.badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Chat Input */}
              <div className="mb-6 rounded-2xl border border-border bg-card p-1 shadow-sm">
                <div className="flex items-end gap-2 px-4 py-3">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
  onChange={(e) => setInputValue(e.target.value)}
  onKeyDown={handleKeyDown}
  placeholder={selectedTaskType ? taskTypes.find(t => t.id === selectedTaskType)?.placeholder : "Ask me anything..."}
  className="max-h-32 min-h-[48px] flex-1 resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground"
                    rows={2}
                  />
                  <Button
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-xl"
                    disabled={!inputValue.trim() || isLoading}
                    onClick={handleSubmit}
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ArrowUp className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Example Prompts */}
              <div className="space-y-3">
                <p className="text-center text-sm text-muted-foreground">
                  Try one of these examples:
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {examplePrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => setInputValue(prompt)}
                      className="rounded-xl border border-border bg-card p-3 text-left text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>


            </div>
          </div>
        ) : (
          // Chat Messages View
          <>
            <div className="flex-1 overflow-auto px-4 py-6">
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((message) => (
                  <div key={message.id} className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}>
                    {message.role === "assistant" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3",
                      message.role === "user" 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    )}>
                      {/* Loading State with Real-time Steps */}
                      {message.status === "processing" && !message.content && (
                        <div className="space-y-2">
                          {taskSteps.length === 0 ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm text-muted-foreground">Starting task...</span>
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-60 overflow-auto">
                              {taskSteps.map((step, idx) => (
                                <div 
                                  key={idx} 
                                  className={cn(
                                    "flex items-start gap-2 text-sm",
                                    step.type === "error" && "text-destructive",
                                    step.type === "success" && "text-green-600",
                                    step.type === "info" && "text-muted-foreground"
                                  )}
                                >
                                  {step.icon === "processing" || step.icon === "waiting" ? (
                                    <Loader2 className="h-3.5 w-3.5 mt-0.5 animate-spin shrink-0" />
                                  ) : step.icon === "check" ? (
                                    <Check className="h-3.5 w-3.5 mt-0.5 text-green-600 shrink-0" />
                                  ) : step.icon === "error" ? (
                                    <X className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
                                  ) : (
                                    <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                  )}
                                  <span className="break-words">{step.desc}</span>
                                </div>
                              ))}
                              <div ref={stepsEndRef} />
                              {/* Still processing indicator */}
                              <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Processing...</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Message Content */}
                      {message.content && (
                        <div className="whitespace-pre-wrap text-sm">
                          {message.content}
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      {message.role === "assistant" && message.content && message.status === "complete" && (
                        <div className="mt-3 flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => handleCopy(message.content, message.id)}
                          >
                            {copiedId === message.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {copiedId === message.id ? "Copied" : "Copy"}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => handleRetry(message.id)}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </Button>
                        </div>
                      )}

                      {/* Error State Actions */}
                      {message.role === "assistant" && message.status === "error" && (
                        <div className="mt-3">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => handleRetry(message.id)}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Try Again
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {message.role === "user" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <span className="text-xs font-medium text-muted-foreground">U</span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="border-t border-border bg-background p-4">
              <div className="mx-auto max-w-3xl">
                <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/50 px-4 py-3">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Send a message..."
                    className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-full"
                    disabled={!inputValue.trim() || isLoading}
                    onClick={handleSubmit}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Results Panel Toggle Button */}
      {showResultsPanel && taskCompleted && !resultsPanelVisible && (
        <div className="flex items-start p-4">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setResultsPanelVisible(true)}
            title="Show results panel"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Results Panel - Only visible when task is completed */}
      {showResultsPanel && taskCompleted && resultsPanelVisible && (
        <div className="flex w-80 flex-col border-l border-border bg-muted/30">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Results</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setResultsPanelVisible(false)}
              title="Hide results panel"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>

          {/* Files Section */}
          {taskFiles.length > 0 && (
            <div className="border-b border-border px-4 py-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Files ({taskFiles.length})
              </div>
              <div className="space-y-2">
                {taskFiles.map((file, index) => (
                  <a
                    key={index}
                    href={file.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={file.fileName}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {file.fileName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {file.mimeType?.split('/').pop()?.toUpperCase() || 'FILE'}
                      </div>
                    </div>
                    <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-auto p-4">
            {taskResults.length > 0 ? (
              <div className="space-y-4">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Output
                </div>
                {taskResults.map((result, index) => (
                  <div key={index} className="rounded-lg bg-background border border-border p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium">Result {index + 1}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleCopy(result, `result-${index}`)}
                      >
                        {copiedId === `result-${index}` ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-60">
                      {result}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No additional output
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Wizard */}
      <DocWizard 
        isOpen={docWizardOpen}
        onClose={() => setDocWizardOpen(false)}
        onGenerate={handleGenerateDoc}
        isGenerating={isGeneratingDoc}
      />

      {/* Slides Wizard */}
      <SlidesWizard
        isOpen={newSlidesWizardOpen}
        onClose={() => setNewSlidesWizardOpen(false)}
        onGenerate={handleGenerateNewSlides}
        isGenerating={isGeneratingNewSlides}
      />

      {/* Generated Document Display */}
      {generatedDocData && (
        <div className="fixed bottom-4 right-4 z-40 w-full max-w-xl">
          <DocViewer 
            doc={generatedDocData}
            onClose={() => setGeneratedDocData(null)}
          />
        </div>
      )}

      {/* Generated Slides Display */}
      {generatedSlidesData && (
        <div className="fixed bottom-4 right-4 z-40 w-full max-w-xl">
          <SlidesViewer 
            data={generatedSlidesData}
            onClose={() => setGeneratedSlidesData(null)}
          />
        </div>
      )}
    </div>
  )
}
