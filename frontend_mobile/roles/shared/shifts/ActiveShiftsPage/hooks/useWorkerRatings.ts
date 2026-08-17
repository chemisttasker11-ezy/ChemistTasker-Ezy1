import { useState, useCallback } from 'react';
import { fetchRatingsSummaryService, fetchRatingsPageService } from '@chemisttasker/shared-core';
import { RatingSummary, RatingComment } from '../types';

export function useWorkerRatings() {
    const [summary, setSummary] = useState<RatingSummary | null>(null);
    const [comments, setComments] = useState<RatingComment[]>([]);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);

    const loadRatings = useCallback(async (workerId: number, pageNum: number) => {
        try {
            const summaryData: any = await fetchRatingsSummaryService({
                targetType: 'worker',
                targetId: workerId,
            });
            const pageData: any = await fetchRatingsPageService({
                targetType: 'worker',
                targetId: workerId,
                page: pageNum,
            });

            setSummary({
                average: summaryData.average ?? summaryData.average_rating ?? 0,
                count: summaryData.count ?? summaryData.total_reviews ?? 0,
            });
            setComments(pageData.results || []);
            setPage(pageNum);
            const totalPages = pageData.count ? Math.ceil(pageData.count / 10) : 1;
            setPageCount(totalPages);
        } catch (error) {
            console.error('Failed to load candidate ratings', error);
            setSummary(null);
            setComments([]);
        }
    }, []);

    const reset = useCallback(() => {
        setSummary(null);
        setComments([]);
        setPage(1);
        setPageCount(1);
    }, []);

    return {
        summary,
        comments,
        page,
        pageCount,
        loadRatings,
        reset,
    };
}
