-- 電子印鑑（クラブ印）設定
-- 領収書に押印する電子印鑑を保持する

-- 印影画像（PNG/JPEG の data URL。クライアント側で 400px 以下にリサイズして保存）
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS stamp_image_url TEXT;

-- 画像を用意しない場合に自動生成する丸印の文字（例: 大阪北RAC）
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS stamp_text TEXT;

-- 押印を有効にするか
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS stamp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
