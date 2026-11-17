import axios from 'axios';

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000/api',
  timeout: 60000,
});

export const fetchInitialGraph = async (limit = 80) => {
  const { data } = await api.get(`/graph/initial?limit=${limit}`);
  return data;
};

export const sendChatQuery = async (question) => {
  const { data } = await api.post('/chat', { question });
  return data;
};