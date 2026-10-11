-- Phone catalog for IMEI autofill: TAC (first 8 digits of an IMEI) -> brand and model.

-- CreateTable
CREATE TABLE "phone_catalog" (
    "tac" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ram" TEXT,
    "storage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_catalog_pkey" PRIMARY KEY ("tac")
);

-- Start from the phones already in stock and sold: for each TAC, the most recently added phone.
INSERT INTO "phone_catalog" ("tac", "brand", "model", "ram", "storage", "updatedAt")
SELECT DISTINCT ON (LEFT("imei", 8))
       LEFT("imei", 8), "brand", "model", NULLIF("ram", ''), NULLIF("storage", ''), CURRENT_TIMESTAMP
FROM "devices"
WHERE "imei" ~ '^[0-9]{15}$' AND TRIM("brand") <> '' AND TRIM("model") <> ''
ORDER BY LEFT("imei", 8), "createdAt" DESC
ON CONFLICT ("tac") DO NOTHING;
