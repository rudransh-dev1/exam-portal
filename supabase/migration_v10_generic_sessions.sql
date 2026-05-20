-- ============================================================
-- Migration v10: Generic Quiz Sessions & Categories
-- ============================================================

-- 1. Extend exams table with categories if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exams' AND column_name='category') THEN
        ALTER TABLE exams ADD COLUMN category TEXT DEFAULT 'Others';
    END IF;
END $$;

-- 2. Create a generic sessions table (if not exists, or migrate data)
-- This table replaces the need for hardcoded round-specific columns
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, SUBMITTED, TERMINATED
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    score FLOAT DEFAULT 0,
    total_marks FLOAT DEFAULT 0,
    metadata JSONB DEFAULT '{}', -- Stores generic metrics (time, rank, etc.)
    UNIQUE(user_id, exam_id)
);

-- 3. Create a generic responses table for all quiz types
CREATE TABLE IF NOT EXISTS quiz_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL,
    answer_json JSONB,
    is_correct BOOLEAN,
    marks_obtained FLOAT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, question_id)
);

-- 4. View for aggregated results (Aptitude vs Programming vs Events)
CREATE OR REPLACE VIEW view_quiz_results AS
SELECT 
    s.id as session_id,
    u.email as student_email,
    e.title as quiz_title,
    s.category,
    s.score,
    s.total_marks,
    s.status,
    s.started_at,
    s.completed_at
FROM quiz_sessions s
JOIN auth.users u ON s.user_id = u.id
JOIN exams e ON s.exam_id = e.id;
