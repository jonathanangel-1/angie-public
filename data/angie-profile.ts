// Synthetic participant. The export name preserves application compatibility.
export const angieProfile = {
  "version": "synthetic-profile-v1",
  "identity": "Fictional demo participant: versatile everyday tailoring with simple layers.",
  "becoming": "Build repeatable outfits and learn from explicit keep, return, and wear feedback.",
  "measurements": {
    "bust": "36 in",
    "waist": "29 in",
    "hips": "40 in",
    "height": "5 ft 8 in",
    "shoulder": "16 in"
  },
  "evidence": {
    "reviewedPurchases": 6,
    "evidencePoints": 6,
    "activeLikedKeeps": 3,
    "keptButNeverWears": 1,
    "returns": 2,
    "blindTrouserLabels": 0,
    "fullLookReviews": 0,
    "inspirationImages": 0
  },
  "reliableColors": [
    "Navy",
    "White",
    "Grey",
    "Black"
  ],
  "selectiveColors": [
    "Green",
    "Blue"
  ],
  "qualitySignals": [
    "Cotton",
    "Linen",
    "Wool"
  ],
  "rules": [
    {
      "id": "R1",
      "title": "Trouser shape",
      "rule": "Prefer straight or controlled trouser shapes.",
      "confidence": "Moderate",
      "evidence": "Invented demo preference; no personal history."
    },
    {
      "id": "R2",
      "title": "Fit evidence",
      "rule": "Separate appearance from confirmed garment fit.",
      "confidence": "Moderate",
      "evidence": "Invented demo preference; no personal history."
    },
    {
      "id": "R3",
      "title": "Deliberate length",
      "rule": "Check hem length against the intended shoes.",
      "confidence": "Moderate",
      "evidence": "Invented demo preference; no personal history."
    },
    {
      "id": "R4",
      "title": "Simple tops",
      "rule": "Prefer regular-length tops with simple shoulders.",
      "confidence": "Moderate",
      "evidence": "Invented demo preference; no personal history."
    },
    {
      "id": "R5",
      "title": "Quality checks",
      "rule": "Require evidence before making fabric quality claims.",
      "confidence": "Moderate",
      "evidence": "Invented demo preference; no personal history."
    },
    {
      "id": "R6",
      "title": "Coherent footwear",
      "rule": "Match shoes to occasion and outfit formality.",
      "confidence": "Moderate",
      "evidence": "Invented demo preference; no personal history."
    },
    {
      "id": "R7",
      "title": "Complete outfits",
      "rule": "Choose pieces that work together.",
      "confidence": "Moderate",
      "evidence": "Invented demo preference; no personal history."
    }
  ],
  "sizeMap": [
    {
      "store": "Demo Atelier",
      "category": "Tops",
      "size": "M",
      "confidence": "Low"
    },
    {
      "store": "Demo Atelier",
      "category": "Bottoms",
      "size": "8",
      "confidence": "Low"
    }
  ],
  "boundaries": [
    "All records and measurements are fictional.",
    "A return alone is not a taste rejection.",
    "Fit confidence requires confirmed outcomes.",
    "Demo products are not purchasable."
  ]
} as const;
export type AngieProfile = typeof angieProfile;
