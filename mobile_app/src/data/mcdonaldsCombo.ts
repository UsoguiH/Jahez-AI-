export type ModifierOption = {
    id: string;
    name_ar: string;
    name_en: string;
    price_delta: number;
    calories?: number;
    default?: boolean;
    badge?: string;
};

export type ModifierGroup = {
    id: string;
    title_ar: string;
    title_en: string;
    required: boolean;
    select: 'single' | 'multi';
    min?: number;
    max?: number;
    options: ModifierOption[];
};

export type ComboItem = {
    id: string;
    name_ar: string;
    name_en: string;
    description_ar: string;
    base_price: number;
    hero_image: string;
    restaurant_ar: string;
    restaurant_en: string;
    groups: ModifierGroup[];
};

export const BIG_MAC_MEAL: ComboItem = {
    id: 'mcd_big_mac_meal',
    name_ar: 'وجبة بيج ماك',
    name_en: 'Big Mac Meal',
    description_ar: 'ساندويتش بيج ماك الشهير مع بطاطس ومشروب على اختيارك',
    base_price: 34.0,
    hero_image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
    restaurant_ar: 'ماكدونالدز',
    restaurant_en: 'McDonald\'s',
    groups: [
        {
            id: 'size',
            title_ar: 'اختر الحجم',
            title_en: 'Choose Size',
            required: true,
            select: 'single',
            options: [
                { id: 'size_m', name_ar: 'وسط', name_en: 'Medium', price_delta: 0, calories: 527, default: true },
                { id: 'size_l', name_ar: 'كبير', name_en: 'Large', price_delta: 2, calories: 597 },
            ],
        },
        {
            id: 'drink',
            title_ar: 'مشروبك',
            title_en: 'Drink',
            required: true,
            select: 'single',
            options: [
                { id: 'drink_cola_zero', name_ar: 'كولا زيرو', name_en: 'Coke Zero', price_delta: 0, calories: 0, default: true },
                { id: 'drink_cola', name_ar: 'كولا', name_en: 'Coke', price_delta: 0, calories: 235 },
                { id: 'drink_sprite', name_ar: 'سبرايت', name_en: 'Sprite', price_delta: 0, calories: 263 },
                { id: 'drink_sprite_zero', name_ar: 'سبرايت زيرو', name_en: 'Sprite Zero', price_delta: 0, calories: 0 },
                { id: 'drink_fanta', name_ar: 'فانتا', name_en: 'Fanta', price_delta: 0, calories: 325 },
                { id: 'drink_orange', name_ar: 'عصير برتقال', name_en: 'Orange Juice', price_delta: 3, calories: 228 },
            ],
        },
        {
            id: 'extras',
            title_ar: 'إضافات',
            title_en: 'Extras',
            required: false,
            select: 'multi',
            max: 4,
            options: [
                { id: 'extra_cheese', name_ar: 'جبنة إضافية', name_en: 'Extra Cheese', price_delta: 2, calories: 70 },
                { id: 'extra_bacon', name_ar: 'بيكون لحم', name_en: 'Beef Bacon', price_delta: 4, calories: 110 },
                { id: 'extra_sauce', name_ar: 'بيج ماك صوص إضافي', name_en: 'Extra Big Mac Sauce', price_delta: 1, calories: 80 },
                { id: 'extra_onions', name_ar: 'بصل مشوي', name_en: 'Grilled Onions', price_delta: 1, calories: 15 },
            ],
        },
        {
            id: 'remove',
            title_ar: 'بدون',
            title_en: 'Remove',
            required: false,
            select: 'multi',
            options: [
                { id: 'rm_pickles', name_ar: 'بدون مخلل', name_en: 'No Pickles', price_delta: 0 },
                { id: 'rm_onions', name_ar: 'بدون بصل', name_en: 'No Onions', price_delta: 0 },
                { id: 'rm_lettuce', name_ar: 'بدون خس', name_en: 'No Lettuce', price_delta: 0 },
                { id: 'rm_sauce', name_ar: 'بدون صوص', name_en: 'No Sauce', price_delta: 0 },
            ],
        },
    ],
};
