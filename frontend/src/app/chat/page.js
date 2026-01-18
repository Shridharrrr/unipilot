'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Typography
} from '@mui/material';
import Layout from '@/components/Layout';
import {
  Send as SendIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  Upload as UploadIcon,
  Description as DocIcon,
  Delete as DeleteIcon,
  School as SchoolIcon,
  Sync as SyncIcon,
  CloudUpload as CloudUploadIcon,
  AttachFile as AttachFileIcon
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { classroomAPI, setAuthToken } from '@/lib/api';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function ChatPage() {
  const router = useRouter();
  const { user, loading: authLoading, getIdToken } = useAuth();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const API_BASE_URL = useMemo(() => {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  }, []);

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "👋 Hello! I'm your AI Assistant. Upload course materials (PDF or Word) or connect your Google Classroom to get started. I can help you understand your study materials, answer questions, and assist with your coursework!",
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [classroomConnected, setClassroomConnected] = useState(false);
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [classroomSyncing, setClassroomSyncing] = useState(false);

  const [indexDialogOpen, setIndexDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [indexing, setIndexing] = useState(false);

  // File upload states
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadCourseName, setUploadCourseName] = useState('');
  const [uploadDocumentName, setUploadDocumentName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Materials selection dialog states
  const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false);
  const [availableMaterials, setAvailableMaterials] = useState([]);
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadDocuments = async () => {
    if (!user) return;
    setDocsLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;

      console.log('🔄 Fetching documents...');
      const res = await fetch(`${API_BASE_URL}/chat/documents`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });

      if (!res.ok) {
        console.error('Failed to fetch documents:', res.status, res.statusText);
        return;
      }
      const data = await res.json();
      console.log('📄 Loaded documents:', data.documents);
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast.error('Failed to load documents list');
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadDocuments();
      checkClassroomStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const checkClassroomStatus = async () => {
    try {
      setClassroomLoading(true);
      const token = await getIdToken();
      if (!token) return;
      setAuthToken(token);
      const resp = await classroomAPI.getStatus();
      setClassroomConnected(!!resp.data.connected);
    } catch (e) {
      setClassroomConnected(false);
    } finally {
      setClassroomLoading(false);
    }
  };

  const connectClassroom = async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      setAuthToken(token);
      const resp = await classroomAPI.getAuthUrl();
      window.location.href = resp.data.auth_url;
    } catch (e) {
      toast.error('Failed to connect Google Classroom. Please try again.');
    }
  };

  const openMaterialsDialog = async () => {
    try {
      setLoadingMaterials(true);
      setMaterialsDialogOpen(true);
      const token = await getIdToken();
      if (!token) return;
      setAuthToken(token);
      const resp = await classroomAPI.listMaterials();
      setAvailableMaterials(resp.data.materials || []);
      setSelectedMaterials([]);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to fetch classroom materials');
      setMaterialsDialogOpen(false);
    } finally {
      setLoadingMaterials(false);
    }
  };

  const syncSelectedMaterials = async () => {
    if (selectedMaterials.length === 0) {
      toast.warning('Please select at least one document to sync');
      return;
    }

    try {
      setClassroomSyncing(true);
      const token = await getIdToken();
      if (!token) return;
      setAuthToken(token);

      const materialsToSync = availableMaterials.filter((m, idx) => selectedMaterials.includes(idx));
      const resp = await classroomAPI.syncMaterials(materialsToSync);
      toast.success(resp.data.message || 'Sync complete! Materials indexed successfully.');
      await loadDocuments();
      setMaterialsDialogOpen(false);
      setSelectedMaterials([]);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to sync classroom materials');
    } finally {
      setClassroomSyncing(false);
      await checkClassroomStatus();
    }
  };

  const toggleMaterialSelection = (idx) => {
    setSelectedMaterials(prev => {
      if (prev.includes(idx)) {
        return prev.filter(i => i !== idx);
      } else {
        return [...prev, idx];
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedMaterials.length === availableMaterials.length) {
      setSelectedMaterials([]);
    } else {
      setSelectedMaterials(availableMaterials.map((_, idx) => idx));
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMsg = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(`${API_BASE_URL}/chat/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: userMsg.content,
          conversation_history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content }))
        })
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer || 'No answer returned.',
          sources: data.sources || [],
          mode: data.mode,
          timestamp: data.timestamp || new Date().toISOString()
        }
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '❌ Failed to get an answer. Make sure backend is running and you are logged in.',
          timestamp: new Date().toISOString()
        }
      ]);
      toast.error('Failed to get response from AI assistant');
    } finally {
      setSending(false);
    }
  };

  const indexPdf = async () => {
    if (!courseName.trim() || !pdfUrl.trim()) {
      toast.warning('Course name and PDF URL are required');
      return;
    }

    setIndexing(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`${API_BASE_URL}/chat/index`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          pdf_url: pdfUrl.trim(),
          course_name: courseName.trim(),
          document_name: documentName.trim() || undefined
        })
      });

      const data = await res.json();
      if (!data.success) {
        toast.error(`Index failed: ${data.error || 'Unknown error'}`);
        return;
      }

      toast.success(`✅ Indexed ${data.chunks_indexed} sections successfully!`);
      setIndexDialogOpen(false);
      setPdfUrl('');
      setCourseName('');
      setDocumentName('');
      await loadDocuments();
    } catch (e) {
      toast.error('Index failed. Check backend logs.');
    } finally {
      setIndexing(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExtensions = ['.pdf', '.docx', '.doc'];
    const fileName = file.name.toLowerCase();
    if (!allowedExtensions.some(ext => fileName.endsWith(ext))) {
      toast.error('Only PDF and Word files (.docx, .doc) are supported');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size exceeds 50MB limit');
      return;
    }

    setSelectedFile(file);
    setUploadDocumentName(file.name);
    setUploadDialogOpen(true);
  };

  const uploadFile = async () => {
    if (!selectedFile || !uploadCourseName.trim()) {
      toast.warning('Please select a file and enter a course name');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const token = await getIdToken();
      if (!token) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('course_name', uploadCourseName.trim());
      if (uploadDocumentName.trim()) {
        formData.append('document_name', uploadDocumentName.trim());
      }

      // Simulate progress (since we can't track actual upload progress easily)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const res = await fetch(`${API_BASE_URL}/chat/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();
      console.log('✅ Upload response:', data);

      if (!res.ok || !data.success) {
        throw new Error(data.detail || 'Upload failed');
      }

      toast.success(`🎉 Successfully uploaded and indexed ${data.chunks_indexed} sections!`);
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadCourseName('');
      setUploadDocumentName('');
      await loadDocuments();
    } catch (e) {
      toast.error(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const deleteDocument = async (docName, courseNameToDelete) => {
    if (!confirm(`Delete "${docName}"?`)) return;

    try {
      const token = await getIdToken();
      if (!token) return;

      await fetch(`${API_BASE_URL}/chat/documents`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ document_name: docName, course_name: courseNameToDelete })
      });

      toast.success('Document deleted successfully');
      await loadDocuments();
    } catch (e) {
      toast.error('Failed to delete document');
    }
  };

  if (authLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Layout>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      <Container maxWidth="xl" sx={{ py: 4, height: 'calc(100vh - 64px)' }}>
        <Box display="flex" gap={3} height="100%">
          <Paper sx={{
            width: 320,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 3,
            bgcolor: 'white',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            border: '1px solid rgba(0,0,0,0.1)'
          }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h6" display="flex" alignItems="center" gap={1} fontWeight="700" color="primary">
                <DocIcon sx={{ color: '#667eea' }} />
                Documents
              </Typography>
              <Box display="flex" gap={0.5}>
                <IconButton
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    bgcolor: 'primary.main',
                    color: 'white',
                    '&:hover': {
                      bgcolor: 'primary.dark',
                      transform: 'scale(1.05)',
                    },
                    transition: 'all 0.2s'
                  }}
                >
                  <CloudUploadIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setIndexDialogOpen(true)}
                  sx={{
                    bgcolor: 'secondary.main',
                    color: 'white',
                    '&:hover': {
                      bgcolor: 'secondary.dark',
                      transform: 'scale(1.05)',
                    },
                    transition: 'all 0.2s'
                  }}
                >
                  <AttachFileIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            {docsLoading ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={22} />
              </Box>
            ) : documents.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 2, bgcolor: 'rgba(102, 126, 234, 0.05)' }}>
                <Typography variant="body2" fontWeight="500">No documents yet</Typography>
                <Typography variant="caption">Upload PDF/Word or sync Google Classroom to get started</Typography>
              </Alert>
            ) : (
              <Box>
                {documents.map((doc, idx) => (
                  <Card
                    key={idx}
                    variant="outlined"
                    sx={{
                      mb: 1.5,
                      borderRadius: 2,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      border: '1px solid rgba(102, 126, 234, 0.1)',
                      '&:hover': {
                        boxShadow: '0 8px 24px rgba(102, 126, 234, 0.15)',
                        transform: 'translateY(-4px)',
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box display="flex" justifyContent="space-between" alignItems="start" gap={1}>
                        <Box flex={1} minWidth={0}>
                          <Typography variant="body2" fontWeight="600" noWrap>
                            {doc.document_name}
                          </Typography>
                          <Chip
                            label={doc.course_name}
                            size="small"
                            sx={{
                              mt: 1,
                              bgcolor: 'primary.main',
                              color: 'white',
                              fontWeight: 500,
                            }}
                          />
                          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                            📑 {doc.chunk_count} sections
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => deleteDocument(doc.document_name, doc.course_name)}
                          sx={{
                            '&:hover': {
                              bgcolor: 'error.light',
                              color: 'error.main',
                            },
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}

            <Divider sx={{ my: 3 }} />
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom display="flex" alignItems="center" gap={1} fontWeight="600" mb={2}>
                <SchoolIcon fontSize="small" sx={{ color: '#667eea' }} />
                Google Classroom
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Button
                  variant={classroomConnected ? 'outlined' : 'contained'}
                  size="medium"
                  onClick={connectClassroom}
                  disabled={classroomLoading}
                  fullWidth
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: classroomConnected ? 'transparent' : 'primary.main',
                    '&:hover': {
                      bgcolor: classroomConnected ? 'transparent' : 'primary.dark',
                    }
                  }}
                >
                  {classroomConnected ? '✓ Connected' : 'Connect'}
                </Button>
                <Button
                  variant="contained"
                  size="medium"
                  onClick={openMaterialsDialog}
                  disabled={!classroomConnected || classroomSyncing}
                  startIcon={classroomSyncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                  fullWidth
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: classroomConnected ? 'primary.main' : 'grey.300',
                    '&:hover': {
                      bgcolor: classroomConnected ? 'primary.dark' : 'grey.300',
                    },
                  }}
                >
                  {classroomSyncing ? 'Syncing...' : 'Sync Materials'}
                </Button>
              </Box>
            </Box>

            <Typography variant="caption" color="text.secondary">
              Backend: {API_BASE_URL}
            </Typography>
          </Paper>

          <Box flex={1} height="100%">
            <Paper sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 3,
              overflow: 'hidden',
              bgcolor: 'white',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
              border: '1px solid rgba(0,0,0,0.1)'
            }}>
              <Box sx={{
                p: 3,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'primary.main',
                boxShadow: '0 4px 20px rgba(102, 126, 234, 0.3)',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <Typography variant="h5" color="white" display="flex" alignItems="center" gap={1} fontWeight="700" sx={{ position: 'relative', zIndex: 1 }}>
                  <BotIcon sx={{ fontSize: 32 }} />
                  AI Assistant
                </Typography>
                <Typography variant="body2" color="white" sx={{ opacity: 0.95, mt: 0.5, position: 'relative', zIndex: 1 }}>
                  Your intelligent study companion - Ask anything about your course materials
                </Typography>
              </Box>

              <Box sx={{
                flex: 1,
                overflow: 'auto',
                p: 3,
                bgcolor: 'transparent',
              }}>
                {messages.map((msg, idx) => (
                  <Box
                    key={idx}
                    display="flex"
                    gap={2}
                    mb={3}
                    flexDirection={msg.role === 'user' ? 'row-reverse' : 'row'}
                    sx={{
                      animation: 'fadeIn 0.3s ease-in',
                      '@keyframes fadeIn': {
                        from: { opacity: 0, transform: 'translateY(10px)' },
                        to: { opacity: 1, transform: 'translateY(0)' },
                      }
                    }}
                  >
                    <Avatar sx={{
                      bgcolor: msg.role === 'user' ? 'primary.main' : 'secondary.main',
                      boxShadow: msg.role === 'user' ? '0 4px 12px rgba(102, 126, 234, 0.3)' : '0 4px 12px rgba(118, 75, 162, 0.3)'
                    }}>
                      {msg.role === 'user' ? <PersonIcon /> : <BotIcon />}
                    </Avatar>

                    <Box flex={1}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2.5,
                          borderRadius: 3,
                          bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.50',
                          color: msg.role === 'user' ? 'white' : 'text.primary',
                          border: msg.role === 'user' ? 'none' : '1px solid rgba(102, 126, 234, 0.1)',
                          boxShadow: msg.role === 'user'
                            ? '0 8px 24px rgba(102, 126, 234, 0.25)'
                            : '0 4px 16px rgba(0,0,0,0.05)',
                          transition: 'all 0.2s',
                          '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: msg.role === 'user'
                              ? '0 12px 32px rgba(102, 126, 234, 0.3)'
                              : '0 8px 24px rgba(0,0,0,0.08)'
                          }
                        }}
                      >
                        <Typography variant="body1" whiteSpace="pre-wrap" sx={{ lineHeight: 1.7 }}>
                          {msg.content}
                        </Typography>

                        {msg.sources && msg.sources.length > 0 && (
                          <Box mt={2}>
                            <Typography variant="caption" display="block" mb={1} fontWeight="bold">
                              Sources
                            </Typography>
                            {msg.sources.map((s, sidx) => (
                              <Chip
                                key={sidx}
                                label={`${s.document_name} (${s.course_name}) #${s.chunk_index}`}
                                size="small"
                                sx={{ mr: 0.5, mb: 0.5 }}
                              />
                            ))}
                          </Box>
                        )}

                        {msg.mode && (
                          <Typography variant="caption" display="block" mt={1} sx={{ opacity: 0.75 }}>
                            Mode: {msg.mode}
                          </Typography>
                        )}
                      </Paper>
                    </Box>
                  </Box>
                ))}

                {sending && (
                  <Box display="flex" gap={2} mb={3}>
                    <Avatar sx={{ bgcolor: 'secondary.main' }}>
                      <BotIcon />
                    </Avatar>
                    <Paper sx={{
                      p: 2.5,
                      bgcolor: 'white',
                      borderRadius: 3,
                      border: '1px solid rgba(102, 126, 234, 0.1)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.05)'
                    }}>
                      <CircularProgress size={18} sx={{ color: 'primary.main' }} />
                      <Typography variant="body2" sx={{ ml: 1.5 }} component="span" color="text.secondary">
                        AI is thinking...
                      </Typography>
                    </Paper>
                  </Box>
                )}

                <div ref={messagesEndRef} />
              </Box>

              <Box sx={{ p: 2.5, borderTop: 1, borderColor: 'divider', bgcolor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(10px)' }}>
                <Box display="flex" gap={1.5}>
                  <TextField
                    fullWidth
                    multiline
                    maxRows={3}
                    placeholder=" Ask me anything about your course materials..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    disabled={sending}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 3,
                        bgcolor: 'white',
                        transition: 'all 0.2s',
                        '&:hover': {
                          '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'primary.main',
                          },
                        },
                        '&.Mui-focused': {
                          boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)',
                        }
                      },
                    }}
                  />
                  <IconButton
                    color="primary"
                    onClick={sendMessage}
                    disabled={!input.trim() || sending}
                    sx={{
                      alignSelf: 'flex-end',
                      bgcolor: 'primary.main',
                      color: 'white',
                      borderRadius: 3,
                      px: 2,
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: 'primary.dark',
                        transform: 'scale(1.05)',
                      },
                      '&:disabled': {
                        bgcolor: 'grey.300',
                        color: 'grey.500',
                      },
                    }}
                  >
                    <SendIcon />
                  </IconButton>
                </Box>
              </Box>
            </Paper>
          </Box>
        </Box>

        {/* URL Index Dialog */}
        <Dialog open={indexDialogOpen} onClose={() => setIndexDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogTitle sx={{ pb: 1 }}>
            <Box>
              <Box component="span" sx={{ fontSize: '1.25rem', fontWeight: 600, display: 'block' }}>📄 Add Document from URL</Box>
              <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', display: 'block', mt: 0.5 }}>Index a PDF from URL to make it searchable</Box>
            </Box>
          </DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Course Name"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Document Name (optional)"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              margin="normal"
            />
            <TextField
              fullWidth
              label="PDF URL"
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              margin="normal"
              placeholder="https://.../file.pdf"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIndexDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={indexPdf} disabled={indexing || !courseName.trim() || !pdfUrl.trim()}>
              {indexing ? 'Indexing...' : 'Index'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* File Upload Dialog */}
        <Dialog open={uploadDialogOpen} onClose={() => !uploading && setUploadDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
          <DialogTitle sx={{ pb: 1 }}>
            <Box>
              <Box component="span" sx={{ fontSize: '1.25rem', fontWeight: 600, display: 'block' }}>📤 Upload Document</Box>
              <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', display: 'block', mt: 0.5 }}>Upload a PDF or Word file from your device</Box>
            </Box>
          </DialogTitle>
          <DialogContent>
            {selectedFile && (
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                <Typography variant="body2" fontWeight="500">Selected: {selectedFile.name}</Typography>
                <Typography variant="caption">Size: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</Typography>
              </Alert>
            )}
            <TextField
              fullWidth
              label="Course Name"
              value={uploadCourseName}
              onChange={(e) => setUploadCourseName(e.target.value)}
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Document Name (optional)"
              value={uploadDocumentName}
              onChange={(e) => setUploadDocumentName(e.target.value)}
              margin="normal"
              helperText="Defaults to filename if not provided"
            />
            {uploading && (
              <Box mt={2}>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  Uploading and indexing... {uploadProgress}%
                </Typography>
                <LinearProgress variant="determinate" value={uploadProgress} sx={{ borderRadius: 1 }} />
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setUploadDialogOpen(false)} disabled={uploading}>Cancel</Button>
            <Button
              variant="contained"
              onClick={uploadFile}
              disabled={uploading || !uploadCourseName.trim() || !selectedFile}
              startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
            >
              {uploading ? 'Uploading...' : 'Upload & Index'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Materials Selection Dialog */}
        <Dialog
          open={materialsDialogOpen}
          onClose={() => setMaterialsDialogOpen(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{ sx: { borderRadius: 3 } }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Box>
              <Box component="span" sx={{ fontSize: '1.25rem', fontWeight: 600, display: 'block' }}>📚 Select Materials to Sync</Box>
              <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Choose documents from your Google Classroom to sync
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent>
            {loadingMaterials ? (
              <Box display="flex" justifyContent="center" alignItems="center" py={4}>
                <CircularProgress />
                <Typography variant="body2" sx={{ ml: 2 }}>Loading materials...</Typography>
              </Box>
            ) : availableMaterials.length === 0 ? (
              <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
                No documents found in your Google Classroom courses.
              </Alert>
            ) : (
              <>
                <Box display="flex" justifyContent="space-between" alignItems="center" my={2}>
                  <Typography variant="body2" color="text.secondary">
                    {selectedMaterials.length} of {availableMaterials.length} selected
                  </Typography>
                  <Button
                    size="small"
                    onClick={toggleSelectAll}
                    sx={{ textTransform: 'none' }}
                  >
                    {selectedMaterials.length === availableMaterials.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </Box>
                <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {availableMaterials.map((material, idx) => (
                    <ListItem
                      key={idx}
                      disablePadding
                      sx={{ mb: 1 }}
                    >
                      <ListItemButton
                        dense
                        onClick={() => toggleMaterialSelection(idx)}
                        sx={{
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: selectedMaterials.includes(idx) ? 'primary.main' : 'grey.300',
                          bgcolor: selectedMaterials.includes(idx) ? 'primary.light' : 'transparent',
                          '&:hover': {
                            bgcolor: selectedMaterials.includes(idx) ? 'primary.light' : 'grey.50',
                          },
                        }}
                      >
                        <Checkbox
                          edge="start"
                          checked={selectedMaterials.includes(idx)}
                          tabIndex={-1}
                          disableRipple
                        />
                        <ListItemText
                          primary={
                            <Typography variant="body2" fontWeight="500">
                              {material.document_name}
                            </Typography>
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary">
                              📖 {material.course_name}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setMaterialsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={syncSelectedMaterials}
              disabled={classroomSyncing || selectedMaterials.length === 0}
              startIcon={classroomSyncing ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {classroomSyncing ? 'Syncing...' : `Sync ${selectedMaterials.length} Document${selectedMaterials.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Layout>
  );
}
