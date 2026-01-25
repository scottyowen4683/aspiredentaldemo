import { useState, useEffect } from 'react';
import { getTopQuestions, TopQuestion } from '@/services/analyticsService';

export const useResidentQuestions = (orgId: string | null, period: string = "30d", limit: number = 10) => {
  const [questions, setQuestions] = useState<TopQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const fetchQuestions = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const fetchedQuestions = await getTopQuestions(orgId, period, limit);
        setQuestions(fetchedQuestions);
      } catch (err) {
        console.error('Error fetching resident questions:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [orgId, period, limit]);

  return { questions, loading, error };
};