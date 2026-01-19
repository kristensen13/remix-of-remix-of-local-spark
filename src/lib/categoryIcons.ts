import {
  Store,
  Footprints,
  Hammer,
  Glasses,
  Gem,
  Watch,
  Dumbbell,
  Scissors,
  Sparkles,
  UtensilsCrossed,
  Beer,
  Coffee,
  Flower2,
  BookOpen,
  Croissant,
  Monitor,
  Cpu,
  Bike,
  Stethoscope,
  Shirt,
  Wrench,
  Guitar,
  Apple,
  ShoppingBag,
  Beef,
  Fish,
  type LucideIcon,
} from 'lucide-react';

// Map of category keywords to Lucide icons
const categoryIconMap: Record<string, LucideIcon> = {
  // Calzado
  zapater: Footprints,
  shoe: Footprints,
  calzado: Footprints,
  
  // Ferretería
  ferreter: Hammer,
  hardware: Hammer,
  
  // Óptica
  óptica: Glasses,
  optica: Glasses,
  optician: Glasses,
  
  // Joyería
  joyer: Gem,
  jewelry: Gem,
  
  // Relojería
  reloj: Watch,
  watch: Watch,
  
  // Gimnasio
  gimnasio: Dumbbell,
  gym: Dumbbell,
  fitness: Dumbbell,
  
  // Peluquería / Belleza
  peluquer: Scissors,
  hair: Scissors,
  barber: Scissors,
  beauty: Sparkles,
  estética: Sparkles,
  estetica: Sparkles,
  
  // Hostelería
  restaurant: UtensilsCrossed,
  restaurante: UtensilsCrossed,
  bar: Beer,
  tapas: Beer,
  cafe: Coffee,
  cafeter: Coffee,
  coffee: Coffee,
  
  // Floristería
  florister: Flower2,
  florist: Flower2,
  flores: Flower2,
  
  // Librería
  librer: BookOpen,
  book: BookOpen,
  
  // Panadería / Pastelería
  panader: Croissant,
  bakery: Croissant,
  pasteler: Croissant,
  
  // Tecnología
  informática: Monitor,
  informatica: Monitor,
  computer: Monitor,
  electronics: Cpu,
  electrónica: Cpu,
  electronica: Cpu,
  
  // Deportes
  deporte: Bike,
  sport: Bike,
  skate: Bike,
  
  // Salud
  clínica: Stethoscope,
  clinica: Stethoscope,
  dental: Stethoscope,
  dentist: Stethoscope,
  
  // Moda
  moda: Shirt,
  boutique: Shirt,
  fashion: Shirt,
  ropa: Shirt,
  
  // Taller / Mecánico
  taller: Wrench,
  mechanic: Wrench,
  auto: Wrench,
  
  // Instrumentos
  instrumento: Guitar,
  instrument: Guitar,
  guitarra: Guitar,
  música: Guitar,
  musica: Guitar,
  
  // Alimentación
  fruter: Apple,
  fruit: Apple,
  verdura: Apple,
  carnicer: Beef,
  butcher: Beef,
  pescader: Fish,
  fish: Fish,
  alimentación: ShoppingBag,
  alimentacion: ShoppingBag,
  grocery: ShoppingBag,
  supermarket: ShoppingBag,
};

/**
 * Get the appropriate icon for a business category
 * Returns Store as default if no match found
 */
export function getCategoryIcon(category: string): LucideIcon {
  const lowerCategory = category.toLowerCase();
  
  for (const [keyword, icon] of Object.entries(categoryIconMap)) {
    if (lowerCategory.includes(keyword)) {
      return icon;
    }
  }
  
  return Store;
}

/**
 * Get the emoji representation for a category (for map markers)
 */
export function getCategoryEmoji(category: string): string {
  const lowerCategory = category.toLowerCase();
  
  const emojiMap: Record<string, string> = {
    zapater: '👟',
    shoe: '👟',
    calzado: '👟',
    ferreter: '🔧',
    hardware: '🔧',
    óptica: '👓',
    optica: '👓',
    optician: '👓',
    joyer: '💎',
    jewelry: '💎',
    reloj: '⌚',
    watch: '⌚',
    gimnasio: '💪',
    gym: '💪',
    fitness: '💪',
    peluquer: '✂️',
    hair: '✂️',
    barber: '✂️',
    beauty: '💅',
    estética: '💅',
    estetica: '💅',
    restaurant: '🍽️',
    restaurante: '🍽️',
    bar: '🍺',
    tapas: '🍺',
    cafe: '☕',
    cafeter: '☕',
    coffee: '☕',
    florister: '🌸',
    florist: '🌸',
    flores: '🌸',
    librer: '📚',
    book: '📚',
    panader: '🥐',
    bakery: '🥐',
    pasteler: '🥐',
    informática: '💻',
    informatica: '💻',
    computer: '💻',
    electronics: '📱',
    electrónica: '📱',
    electronica: '📱',
    deporte: '🚴',
    sport: '🚴',
    skate: '🛹',
    clínica: '🏥',
    clinica: '🏥',
    dental: '🦷',
    dentist: '🦷',
    moda: '👗',
    boutique: '👗',
    fashion: '👗',
    ropa: '👗',
    taller: '🔩',
    mechanic: '🔩',
    auto: '🚗',
    instrumento: '🎸',
    instrument: '🎸',
    guitarra: '🎸',
    música: '🎵',
    musica: '🎵',
    fruter: '🍎',
    fruit: '🍎',
    verdura: '🥬',
    carnicer: '🥩',
    butcher: '🥩',
    pescader: '🐟',
    fish: '🐟',
    alimentación: '🛒',
    alimentacion: '🛒',
    grocery: '🛒',
  };
  
  for (const [keyword, emoji] of Object.entries(emojiMap)) {
    if (lowerCategory.includes(keyword)) {
      return emoji;
    }
  }
  
  return '🏪';
}
