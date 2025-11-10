"""
SQLite-based document processing queue

Provides persistent queue for document processing that survives server restarts.
No external dependencies - uses built-in SQLite.
"""

import sqlite3
import uuid
import logging
import asyncio
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Callable
from contextlib import contextmanager

logger = logging.getLogger("document_queue")


class DocumentQueue:
    """
    Persistent document processing queue backed by SQLite.

    Features:
    - Persistent queue (survives crashes)
    - Honest status tracking (queued -> processing -> completed/failed)
    - Background worker thread
    - Retry logic for failed jobs
    - Progress monitoring
    """

    def __init__(self, db_path: str = "document_queue.db"):
        self.db_path = db_path
        self.worker_thread: Optional[threading.Thread] = None
        self.worker_running = False
        self.processor_func: Optional[Callable] = None
        self.status_checker_func: Optional[Callable] = None
        self._init_db()
        logger.info(f"DocumentQueue initialized with database: {db_path}")

    def _init_db(self):
        """Initialize database schema"""
        with self._get_connection() as conn:
            # Create table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    notebook_id TEXT NOT NULL,
                    document_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    status TEXT DEFAULT 'queued',
                    priority INTEGER DEFAULT 0,
                    retry_count INTEGER DEFAULT 0,
                    max_retries INTEGER DEFAULT 2,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    failed_at TIMESTAMP,
                    error TEXT
                )
            """)

            # Create indexes separately
            conn.execute("CREATE INDEX IF NOT EXISTS idx_status ON jobs(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_notebook ON jobs(notebook_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_created ON jobs(created_at)")

            conn.commit()
            logger.info("Database schema initialized")

    @contextmanager
    def _get_connection(self):
        """Context manager for database connections"""
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def enqueue(self, notebook_id: str, document_id: str, content: str, priority: int = 0) -> str:
        """
        Add a document to the processing queue

        Args:
            notebook_id: ID of the notebook
            document_id: ID of the document
            content: Document content to process
            priority: Higher priority = processed first (default: 0)

        Returns:
            job_id: Unique job identifier
        """
        job_id = str(uuid.uuid4())

        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO jobs (id, notebook_id, document_id, content, status, priority)
                VALUES (?, ?, ?, ?, 'queued', ?)
            """, (job_id, notebook_id, document_id, content, priority))
            conn.commit()

        logger.info(f"Enqueued job {job_id} for document {document_id} in notebook {notebook_id}")
        return job_id

    def get_next_job(self) -> Optional[Dict]:
        """Get the next job from the queue (highest priority, oldest first)"""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT id, notebook_id, document_id, content, retry_count, max_retries
                FROM jobs
                WHERE status = 'queued'
                ORDER BY priority DESC, created_at ASC
                LIMIT 1
            """)
            row = cursor.fetchone()

            if row:
                return {
                    'job_id': row['id'],
                    'notebook_id': row['notebook_id'],
                    'document_id': row['document_id'],
                    'content': row['content'],
                    'retry_count': row['retry_count'],
                    'max_retries': row['max_retries']
                }
        return None

    def mark_processing(self, job_id: str):
        """Mark a job as currently processing"""
        with self._get_connection() as conn:
            conn.execute("""
                UPDATE jobs
                SET status = 'processing', started_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (job_id,))
            conn.commit()
        logger.info(f"Job {job_id} marked as processing")

    def mark_completed(self, job_id: str):
        """Mark a job as successfully completed"""
        with self._get_connection() as conn:
            conn.execute("""
                UPDATE jobs
                SET status = 'completed', completed_at = CURRENT_TIMESTAMP, error = NULL
                WHERE id = ?
            """, (job_id,))
            conn.commit()
        logger.info(f"Job {job_id} completed successfully")

    def mark_failed(self, job_id: str, error: str):
        """Mark a job as failed with error message"""
        with self._get_connection() as conn:
            # Get current retry count
            cursor = conn.execute("""
                SELECT retry_count, max_retries FROM jobs WHERE id = ?
            """, (job_id,))
            row = cursor.fetchone()

            if row:
                retry_count = row['retry_count']
                max_retries = row['max_retries']

                if retry_count < max_retries:
                    # Retry: increment count and requeue
                    conn.execute("""
                        UPDATE jobs
                        SET status = 'queued',
                            retry_count = retry_count + 1,
                            error = ?
                        WHERE id = ?
                    """, (f"Retry {retry_count + 1}/{max_retries}: {error}", job_id))
                    logger.warning(f"Job {job_id} failed, requeueing (retry {retry_count + 1}/{max_retries})")
                else:
                    # Max retries reached, mark as failed
                    conn.execute("""
                        UPDATE jobs
                        SET status = 'failed',
                            failed_at = CURRENT_TIMESTAMP,
                            error = ?
                        WHERE id = ?
                    """, (f"Failed after {max_retries} retries: {error}", job_id))
                    logger.error(f"Job {job_id} failed permanently after {max_retries} retries")

                conn.commit()

    def get_job_status(self, job_id: str) -> Optional[Dict]:
        """Get the status of a specific job"""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM jobs WHERE id = ?
            """, (job_id,))
            row = cursor.fetchone()

            if row:
                return dict(row)
        return None

    def get_queue_stats(self, notebook_id: Optional[str] = None) -> Dict:
        """Get statistics about the queue"""
        with self._get_connection() as conn:
            if notebook_id:
                cursor = conn.execute("""
                    SELECT
                        status,
                        COUNT(*) as count
                    FROM jobs
                    WHERE notebook_id = ?
                    GROUP BY status
                """, (notebook_id,))
            else:
                cursor = conn.execute("""
                    SELECT
                        status,
                        COUNT(*) as count
                    FROM jobs
                    GROUP BY status
                """)

            stats = {row['status']: row['count'] for row in cursor.fetchall()}

            return {
                'queued': stats.get('queued', 0),
                'processing': stats.get('processing', 0),
                'completed': stats.get('completed', 0),
                'failed': stats.get('failed', 0),
                'total': sum(stats.values())
            }

    def get_jobs_by_notebook(self, notebook_id: str, status: Optional[str] = None) -> List[Dict]:
        """Get all jobs for a specific notebook"""
        with self._get_connection() as conn:
            if status:
                cursor = conn.execute("""
                    SELECT * FROM jobs
                    WHERE notebook_id = ? AND status = ?
                    ORDER BY created_at DESC
                """, (notebook_id, status))
            else:
                cursor = conn.execute("""
                    SELECT * FROM jobs
                    WHERE notebook_id = ?
                    ORDER BY created_at DESC
                """, (notebook_id,))

            return [dict(row) for row in cursor.fetchall()]

    def recover_stuck_jobs(self, timeout_seconds: Optional[int] = None) -> int:
        """
        Find jobs stuck in 'processing' state and requeue them

        Args:
            timeout_seconds: How long a job can be processing before it's considered stuck.
                           If None, recovers ALL processing jobs (useful on startup)

        Returns:
            Number of jobs recovered
        """
        with self._get_connection() as conn:
            if timeout_seconds is None:
                # Recover ALL processing jobs (on startup)
                cursor = conn.execute("""
                    UPDATE jobs
                    SET status = 'queued',
                        error = 'Recovered from server restart'
                    WHERE status = 'processing'
                """)
            else:
                # Recover only jobs stuck for longer than timeout (runtime recovery)
                cursor = conn.execute("""
                    UPDATE jobs
                    SET status = 'queued',
                        error = 'Recovered from stuck state'
                    WHERE status = 'processing'
                    AND started_at < datetime('now', '-' || ? || ' seconds')
                """, (timeout_seconds,))
            
            conn.commit()
            recovered = cursor.rowcount

        if recovered > 0:
            logger.warning(f"Recovered {recovered} stuck jobs")

        return recovered

    def clear_old_jobs(self, days: int = 30) -> int:
        """Delete old completed/failed jobs older than N days"""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                DELETE FROM jobs
                WHERE status IN ('completed', 'failed')
                AND (completed_at < datetime('now', '-' || ? || ' days')
                     OR failed_at < datetime('now', '-' || ? || ' days'))
            """, (days, days))
            conn.commit()
            deleted = cursor.rowcount

        if deleted > 0:
            logger.info(f"Deleted {deleted} old jobs (older than {days} days)")

        return deleted

    def set_processor(self, processor_func: Callable):
        """
        Set the processor function that will handle jobs

        Args:
            processor_func: async function(notebook_id, document_id, content) -> None
        """
        self.processor_func = processor_func
        logger.info("Processor function registered")

    def set_status_checker(self, status_checker_func: Callable):
        """
        Set the status checker function to verify document processing results

        Args:
            status_checker_func: function(document_id) -> tuple[str, str]
                Returns (status, error_message) where status is "completed", "failed", or "processing"
        """
        self.status_checker_func = status_checker_func
        logger.info("Status checker function registered")

    def start_worker(self):
        """Start the background worker thread"""
        if self.worker_running:
            logger.warning("Worker already running")
            return

        if not self.processor_func:
            raise ValueError("No processor function set. Call set_processor() first.")

        self.worker_running = True
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()
        logger.info("Background worker thread started")

    def stop_worker(self):
        """Stop the background worker thread"""
        if not self.worker_running:
            return

        self.worker_running = False
        if self.worker_thread:
            self.worker_thread.join(timeout=5)
        logger.info("Background worker thread stopped")

    def _worker_loop(self):
        """Main worker loop that processes jobs from the queue"""
        logger.info("Worker loop started")

        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        while self.worker_running:
            try:
                # Get next job
                job = self.get_next_job()

                if job:
                    job_id = job['job_id']
                    notebook_id = job['notebook_id']
                    document_id = job['document_id']
                    content = job['content']

                    try:
                        # Mark as processing
                        self.mark_processing(job_id)

                        # Process the document
                        logger.info(f"Processing job {job_id} for document {document_id}")
                        loop.run_until_complete(
                            self.processor_func(notebook_id, document_id, content)
                        )

                        # Verify document status after processing
                        # The processor may have marked the document as failed internally
                        # without raising an exception (e.g., silent LightRAG failures)
                        if self.status_checker_func:
                            doc_status, error_message = self.status_checker_func(document_id)
                            logger.info(f"Document {document_id} status after processing: {doc_status}")

                            if doc_status == "completed":
                                self.mark_completed(job_id)
                                logger.info(f"✓ Job {job_id} completed successfully")
                            elif doc_status == "failed":
                                error_msg = error_message or "Document processing failed"
                                self.mark_failed(job_id, error_msg)
                                logger.error(f"✗ Job {job_id} marked as failed: {error_msg}")
                            else:
                                # Status is still "processing" or unexpected value - something went wrong
                                error_msg = f"Document status is '{doc_status}' after processing - expected 'completed' or 'failed'"
                                self.mark_failed(job_id, error_msg)
                                logger.error(f"✗ Job {job_id} failed verification: {error_msg}")
                        else:
                            # No status checker - fall back to old behavior (mark as completed)
                            # This maintains backward compatibility
                            self.mark_completed(job_id)
                            logger.warning(f"Job {job_id} completed without status verification (no status_checker_func set)")

                    except Exception as e:
                        # Mark as failed (will retry if retries remaining)
                        error_msg = str(e)
                        logger.error(f"✗ Job {job_id} failed with exception: {error_msg}")
                        self.mark_failed(job_id, error_msg)
                else:
                    # No jobs in queue, sleep briefly
                    time.sleep(1)

            except Exception as e:
                logger.error(f"Worker loop error: {e}")
                time.sleep(1)

        loop.close()
        logger.info("Worker loop stopped")
