export type ItemCategory = 'top' | 'bottom' | 'dress' | 'shoes' | 'layer';
export type ItemSource = 'closet' | 'shop';

export type StylistItem = {
  id: string;
  name: string;
  brand: string;
  category: ItemCategory;
  source: ItemSource;
  image?: string;
  url?: string;
  price?: number;
  color: string;
  size: string;
  sizeConfidence: 'High' | 'Moderate' | 'Low';
  taste: number;
  fit: number;
  quality: number;
  novelty: number;
  formality: number;
  silhouette: 'fitted' | 'straight' | 'controlled' | 'fluid' | 'structured' | 'relaxed';
  occasions: string[];
  tags: string[];
  evidence: string;
  fitRisk: string;
  checkedAt?: string;
  hardReject?: boolean;
  rejectionReason?: string;
};

export const stylistCatalog: StylistItem[] = [
  {
    "id": "demo-product-01",
    "name": "Cotton crew tee",
    "brand": "Demo Atelier",
    "category": "top",
    "source": "closet",
    "image": "/demo/demo-product-01.svg",
    "url": "https://shop.example.com/products/demo-product-01",
    "price": 42,
    "color": "White",
    "size": "M",
    "sizeConfidence": "Low",
    "taste": 76,
    "fit": 66,
    "quality": 75,
    "novelty": 31,
    "formality": 3,
    "silhouette": "fitted",
    "occasions": [
      "casual",
      "polished",
      "evening",
      "tailored"
    ],
    "tags": [
      "minimal",
      "straight",
      "clean-shoulder"
    ],
    "evidence": "Invented demo preference.",
    "fitRisk": "Synthetic product; fit has not been verified."
  },
  {
    "id": "demo-product-02",
    "name": "Cotton poplin shirt",
    "brand": "Demo Atelier",
    "category": "top",
    "source": "closet",
    "image": "/demo/demo-product-02.svg",
    "url": "https://shop.example.com/products/demo-product-02",
    "price": 54,
    "color": "Navy",
    "size": "M",
    "sizeConfidence": "Low",
    "taste": 77,
    "fit": 67,
    "quality": 75,
    "novelty": 32,
    "formality": 3,
    "silhouette": "straight",
    "occasions": [
      "casual",
      "polished",
      "evening",
      "tailored"
    ],
    "tags": [
      "minimal",
      "straight",
      "clean-shoulder"
    ],
    "evidence": "Invented demo preference.",
    "fitRisk": "Synthetic product; fit has not been verified."
  },
  {
    "id": "demo-product-03",
    "name": "Fine cotton knit",
    "brand": "Demo Atelier",
    "category": "top",
    "source": "closet",
    "image": "/demo/demo-product-03.svg",
    "url": "https://shop.example.com/products/demo-product-03",
    "price": 66,
    "color": "Grey",
    "size": "M",
    "sizeConfidence": "Low",
    "taste": 78,
    "fit": 68,
    "quality": 75,
    "novelty": 33,
    "formality": 3,
    "silhouette": "fitted",
    "occasions": [
      "casual",
      "polished",
      "evening",
      "tailored"
    ],
    "tags": [
      "minimal",
      "straight",
      "clean-shoulder"
    ],
    "evidence": "Invented demo preference.",
    "fitRisk": "Synthetic product; fit has not been verified."
  },
  {
    "id": "demo-product-04",
    "name": "Straight tailored trousers",
    "brand": "Demo Atelier",
    "category": "bottom",
    "source": "shop",
    "image": "/demo/demo-product-04.svg",
    "url": "https://shop.example.com/products/demo-product-04",
    "price": 78,
    "color": "Navy",
    "size": "8",
    "sizeConfidence": "Low",
    "taste": 79,
    "fit": 69,
    "quality": 75,
    "novelty": 34,
    "formality": 3,
    "silhouette": "straight",
    "occasions": [
      "casual",
      "polished",
      "evening",
      "tailored"
    ],
    "tags": [
      "minimal",
      "straight",
      "clean-shoulder"
    ],
    "evidence": "Invented demo preference.",
    "fitRisk": "Synthetic product; fit has not been verified."
  },
  {
    "id": "demo-product-05",
    "name": "Controlled linen trousers",
    "brand": "Demo Atelier",
    "category": "bottom",
    "source": "shop",
    "image": "/demo/demo-product-05.svg",
    "url": "https://shop.example.com/products/demo-product-05",
    "price": 90,
    "color": "Black",
    "size": "8",
    "sizeConfidence": "Low",
    "taste": 80,
    "fit": 70,
    "quality": 75,
    "novelty": 35,
    "formality": 3,
    "silhouette": "controlled",
    "occasions": [
      "casual",
      "polished",
      "evening",
      "tailored"
    ],
    "tags": [
      "minimal",
      "straight",
      "clean-shoulder"
    ],
    "evidence": "Invented demo preference.",
    "fitRisk": "Synthetic product; fit has not been verified."
  },
  {
    "id": "demo-product-06",
    "name": "Straight denim jeans",
    "brand": "Demo Atelier",
    "category": "bottom",
    "source": "shop",
    "image": "/demo/demo-product-06.svg",
    "url": "https://shop.example.com/products/demo-product-06",
    "price": 102,
    "color": "Blue",
    "size": "8",
    "sizeConfidence": "Low",
    "taste": 81,
    "fit": 71,
    "quality": 75,
    "novelty": 36,
    "formality": 3,
    "silhouette": "straight",
    "occasions": [
      "casual",
      "polished",
      "evening",
      "tailored"
    ],
    "tags": [
      "minimal",
      "straight",
      "clean-shoulder"
    ],
    "evidence": "Invented demo preference.",
    "fitRisk": "Synthetic product; fit has not been verified."
  },
  {
    "id": "demo-product-07",
    "name": "Simple column dress",
    "brand": "Demo Atelier",
    "category": "dress",
    "source": "shop",
    "image": "/demo/demo-product-07.svg",
    "url": "https://shop.example.com/products/demo-product-07",
    "price": 114,
    "color": "Black",
    "size": "8",
    "sizeConfidence": "Low",
    "taste": 82,
    "fit": 72,
    "quality": 75,
    "novelty": 37,
    "formality": 3,
    "silhouette": "fitted",
    "occasions": [
      "casual",
      "polished",
      "evening",
      "tailored"
    ],
    "tags": [
      "minimal",
      "straight",
      "clean-shoulder"
    ],
    "evidence": "Invented demo preference.",
    "fitRisk": "Synthetic product; fit has not been verified."
  },
  {
    "id": "demo-product-08",
    "name": "Leather low heel",
    "brand": "Demo Atelier",
    "category": "shoes",
    "source": "shop",
    "image": "/demo/demo-product-08.svg",
    "url": "https://shop.example.com/products/demo-product-08",
    "price": 126,
    "color": "Black",
    "size": "8",
    "sizeConfidence": "Low",
    "taste": 83,
    "fit": 73,
    "quality": 75,
    "novelty": 38,
    "formality": 3,
    "silhouette": "controlled",
    "occasions": [
      "casual",
      "polished",
      "evening",
      "tailored"
    ],
    "tags": [
      "minimal",
      "straight",
      "clean-shoulder"
    ],
    "evidence": "Invented demo preference.",
    "fitRisk": "Synthetic product; fit has not been verified."
  },
  {
    "id": "demo-product-09",
    "name": "Structured wool jacket",
    "brand": "Demo Atelier",
    "category": "layer",
    "source": "shop",
    "image": "/demo/demo-product-09.svg",
    "url": "https://shop.example.com/products/demo-product-09",
    "price": 138,
    "color": "Grey",
    "size": "8",
    "sizeConfidence": "Low",
    "taste": 84,
    "fit": 74,
    "quality": 75,
    "novelty": 39,
    "formality": 3,
    "silhouette": "structured",
    "occasions": [
      "casual",
      "polished",
      "evening",
      "tailored"
    ],
    "tags": [
      "minimal",
      "straight",
      "clean-shoulder"
    ],
    "evidence": "Invented demo preference.",
    "fitRisk": "Synthetic product; fit has not been verified."
  }
];
