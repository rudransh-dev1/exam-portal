-- ============================================================
-- Migration v10 (Fixed): Generic Quiz Sessions & Categories
-- Uses 'exam_config' as the base exams table.
-- ============================================================

-- 1. Ensure category column exists in exam_config (should already exist)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_config' AND column_name='category') THEN
        ALTER TABLE exam_config ADD COLUMN category TEXT DEFAULT 'Others';
    END IF;
END $$;

-- 2. Create a generic sessions table
-- This table tracks user attempts for any assessment
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES exam_config(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, SUBMITTED, TERMINATED
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    score FLOAT DEFAULT 0,
    total_marks FLOAT DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    UNIQUE(user_id, exam_id)
);

-- 3. Create a generic responses table for all quiz types
CREATE TABLE IF NOT EXISTS quiz_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL,
    answer_json JSONB,
    is_correct BOOLEAN,
    marks_obtained FLOAT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, question_id)
);

-- 4. Create a generic telemetry table
CREATE TABLE IF NOT EXISTS quiz_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. View for aggregated results
CREATE OR REPLACE VIEW view_quiz_results AS
SELECT 
    s.id as session_id,
    u.email as student_email,
    e.exam_title as quiz_title,
    s.category,
    s.score,
    s.total_marks,
    s.status,
    s.started_at,
    s.completed_at
FROM quiz_sessions s
JOIN auth.users u ON s.user_id = u.id
JOIN exam_config e ON s.exam_id = e.id;
