const LanguageManager = {
    currentLang: localStorage.getItem('appLanguage') || 'km',

    translations: {
        en: {
            "nav_dashboard": "Dashboard",
            "nav_registration": "Registration",
            "nav_student_list": "Student List",
            "nav_income_expense": "Income & Expense",
            "nav_inventory": "Inventory",
            "nav_users": "User Management",
            "nav_logout": "Logout",
            "welcome": "Welcome"
        },
        km: {
            "nav_dashboard": "ផ្ទាំងគ្រប់គ្រង",
            "nav_registration": "ចុះឈ្មោះសិស្ស",
            "nav_student_list": "បញ្ជីទិន្នន័យសិស្ស",
            "nav_income_expense": "ចំណូល-ចំណាយ",
            "nav_inventory": "គ្រប់គ្រងស្តុក",
            "nav_users": "គ្រប់គ្រងអ្នកប្រើប្រាស់",
            "nav_logout": "ចាកចេញ",
            "welcome": "សូមស្វាគមន៍"
        },
        zh: {
            "nav_dashboard": "仪表板",
            "nav_registration": "学生注册",
            "nav_student_list": "学生名单",
            "nav_income_expense": "收入与支出",
            "nav_inventory": "库存管理",
            "nav_users": "用户管理",
            "nav_logout": "登出",
            "welcome": "欢迎"
        }
    },

    init() {
        this.applyLanguage(this.currentLang);
        this.renderLanguageSwitcher();
    },

    setLanguage(lang) {
        if (this.translations[lang]) {
            this.currentLang = lang;
            localStorage.setItem('appLanguage', lang);
            this.applyLanguage(lang);
            this.updateSwitcherUI();
        }
    },

    applyLanguage(lang) {
        const trans = this.translations[lang];
        document.documentElement.lang = lang;

        // Update elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (trans[key]) {
                if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
                    el.placeholder = trans[key];
                } else {
                    el.textContent = trans[key];
                }
            }
        });

        // Broadcast event
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    },

    renderLanguageSwitcher() {
        // Find a place to put the switcher, e.g., in the sidebar or header
        // For now, let's assume there is a container or append to body if not found
        // This is a placeholder implementation.
    },

    updateSwitcherUI() {
        // Update active state of buttons
    }
};

document.addEventListener('DOMContentLoaded', () => {
    LanguageManager.init();
});
