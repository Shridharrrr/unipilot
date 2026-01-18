import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add request interceptor for debugging
api.interceptors.request.use(
    (config) => {
        const authHeader = config.headers['Authorization'];
        if (authHeader) {
            console.log('✅ Request to:', config.url, 'with Authorization header');
        } else {
            console.warn('⚠️ Request to:', config.url, 'WITHOUT Authorization header');
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            console.error('🔒 401 Unauthorized:', error.response.data);
            console.error('Request URL:', error.config.url);
            console.error('Request headers:', error.config.headers);
        }
        return Promise.reject(error);
    }
);

// Add auth token to requests
export const setAuthToken = (token) => {
    if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        console.log('🔑 Auth token set, length:', token.length);
    } else {
        delete api.defaults.headers.common['Authorization'];
        console.log('🔓 Auth token removed');
    }
};

// Auth endpoints
export const authAPI = {
    getCurrentUser: () => api.get('/api/auth/me'),
    updatePreferences: (preferences) => api.put('/api/auth/me/preferences', preferences),
};

// Task endpoints
export const tasksAPI = {
    getTasks: (status) => api.get('/api/tasks', { params: { status } }),
    getTask: (id) => api.get(`/api/tasks/${id}`),
    createTask: (taskData) => api.post('/api/tasks', taskData),
    updateTask: (id, taskData) => api.put(`/api/tasks/${id}`, taskData),
    deleteTask: (id) => api.delete(`/api/tasks/${id}`),
    prioritizeTasks: () => api.post('/api/tasks/prioritize'),
    getResources: (id) => api.get(`/api/tasks/${id}/resources`),

    // Timer endpoints
    startTimer: (id) => api.post(`/api/tasks/${id}/timer/start`),
    pauseTimer: (id) => api.post(`/api/tasks/${id}/timer/pause`),

    // Burnout rating
    submitBurnoutRating: (id, rating) => api.post(`/api/tasks/${id}/burnout-rating`, null, { params: { rating } }),
    getProcrastinationPrediction: (id) => api.get(`/api/tasks/${id}/prediction/procrastination`),
};

// Syllabus API
export const syllabusAPI = {
    extract: (pdfUrl) => api.post('/api/syllabus/extract', { pdf_url: pdfUrl }),
    extractAndSave: (pdfUrl) => api.post('/api/syllabus/extract-and-save', { pdf_url: pdfUrl }),
    uploadAndExtract: (formData) => api.post('/api/syllabus/upload-and-extract', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    }),
};

// Schedule endpoints
export const scheduleAPI = {
    generateSchedule: (scheduleData) => api.post('/api/schedule/generate', scheduleData),
    generateWeeklySchedule: (data) => api.post('/api/schedule/weekly', data),
    getSchedule: (date) => api.get('/api/schedule', { params: { date } }),
};

// Calendar endpoints
export const calendarAPI = {
    getAuthUrl: () => api.get('/api/calendar/auth-url'),
    getStatus: () => api.get('/api/calendar/status'),
    disconnect: () => api.post('/api/calendar/disconnect'),
    syncTask: (taskId) => api.post(`/api/calendar/sync-task/${taskId}`),
    syncAll: () => api.post('/api/calendar/sync-all'),
};

// Classroom endpoints
export const classroomAPI = {
    getAuthUrl: () => api.get('/api/classroom/auth-url'),
    getStatus: () => api.get('/api/classroom/status'),
    disconnect: () => api.post('/api/classroom/disconnect'),
    getCourses: () => api.get('/api/classroom/courses'),
    listMaterials: () => api.get('/api/classroom/list-materials'),
    syncMaterials: (materials) => api.post('/api/classroom/sync-materials', { materials }),
};

// Project endpoints
export const projectsAPI = {
    getProjects: () => api.get('/api/projects'),
    getProject: (id) => api.get(`/api/projects/${id}`),
    createProject: (projectData) => api.post('/api/projects', projectData),
    updateProject: (id, projectData) => api.put(`/api/projects/${id}`, projectData),
    deleteProject: (id) => api.delete(`/api/projects/${id}`),
    addMember: (projectId, email) => api.post(`/api/projects/${projectId}/members`, { email }),
    removeMember: (projectId, userId) => api.delete(`/api/projects/${projectId}/members/${userId}`),
    assignTask: (projectId, taskId, userId) =>
        api.post(`/api/projects/${projectId}/tasks/${taskId}/assign`, { user_id: userId }),
};

export const projectChatAPI = {
    getMessages: (projectId, limit = 50) => api.get(`/api/projects/${projectId}/messages`, { params: { limit } }),
    generateSummary: (projectId) => api.post(`/api/projects/${projectId}/chat/summarize`),
};

// Notification endpoints
export const notificationsAPI = {
    getNotifications: () => api.get('/api/notifications'),
    acceptInvite: (notificationId) => api.post(`/api/notifications/${notificationId}/accept`),
    rejectInvite: (notificationId) => api.post(`/api/notifications/${notificationId}/reject`),
    deleteNotification: (notificationId) => api.delete(`/api/notifications/${notificationId}`),
};

// Graph endpoints
export const graphAPI = {
    getData: () => api.get('/api/graph/data'),
};

export default api;

// Project Task endpoints
export const projectTasksAPI = {
    createTask: (projectId, taskData) => api.post(`/api/projects/${projectId}/tasks`, taskData),
    getTasks: (projectId) => api.get(`/api/projects/${projectId}/tasks`),
    updateTask: (projectId, taskId, taskData) => api.put(`/api/projects/${projectId}/tasks/${taskId}`, taskData),
    completeTask: (projectId, taskId) => api.post(`/api/projects/${projectId}/tasks/${taskId}/complete`),
    deleteTask: (projectId, taskId) => api.delete(`/api/projects/${projectId}/tasks/${taskId}`),
};






