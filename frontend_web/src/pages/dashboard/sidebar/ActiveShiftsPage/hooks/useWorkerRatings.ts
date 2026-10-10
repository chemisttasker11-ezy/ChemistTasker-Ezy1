import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchRatingsSummaryService, fetchRatingsPageService } from '@chemisttasker/shared-core';
import { RatingSummary, RatingComment } from '../types';

export function useWorkerRatings() {
    const [summary, setSummary] = useState<RatingSummary | null>(null);
    const [comments, setComments] = useState<RatingComment[]>([]);
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const request = useRef(0);
    useEffect(() => () => { request.current += 1; }, []);

    const loadRatings = useCallback(async (workerId: number, pageNum: number) => {
        const generation = ++request.current;
        try {
            const summaryData = await fetchRatingsSummaryService({
                targetType: 'worker',
                targetId: workerId,
            });
            const pageData: any = await fetchRatingsPageService({
                targetType: 'worker',
                targetId: workerId,
                page: pageNum,
            });

            if (generation !== request.current) return;
            setSummary({
                average: summaryData.average ?? 0,
                count: summaryData.count ?? 0,
            });
            setComments(pageData.results || []);
            setPage(pageNum);
            const totalPages = pageData.count ? Math.ceil(pageData.count / 10) : 1;
            setPageCount(totalPages);
        } catch (error) {
            if (generation !== request.current) return;
            console.error('Failed to load candidate ratings', error);
            setSummary(null);
            setComments([]);
        }
    }, []);

    const reset = useCallback(() => {
        request.current += 1;
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
