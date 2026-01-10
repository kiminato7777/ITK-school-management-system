// បន្ថែម function ដើម្បីសម្អាតទិន្នន័យ Firebase
const cleanFirebaseData = () => {
    // សម្អាត Stock In data
    stockInRef.once('value').then(snapshot => {
        if (snapshot.exists()) {
            const updates = {};
            snapshot.forEach(child => {
                const item = child.val();
                if (!item.unitCostUSD && item.unitCost) {
                    updates[child.key] = {
                        ...item,
                        unitCostUSD: parseFloat(item.unitCost) || 0
                    };
                }
            });
            
            if (Object.keys(updates).length > 0) {
                stockInRef.update(updates);
                console.log('Cleaned Stock In data');
            }
        }
    });
    
    // សម្អាត Stock Out data  
    stockOutRef.once('value').then(snapshot => {
        if (snapshot.exists()) {
            const updates = {};
            snapshot.forEach(child => {
                const item = child.val();
                if (!item.sellingPriceUSD && item.sellingPrice) {
                    updates[child.key] = {
                        ...item,
                        sellingPriceUSD: parseFloat(item.sellingPrice) || 0
                    };
                }
            });
            
            if (Object.keys(updates).length > 0) {
                stockOutRef.update(updates);
                console.log('Cleaned Stock Out data');
            }
        }
    });
};

// បន្ថែមនៅក្នុង DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // ... កូដដើម ...
    
    // សម្អាតទិន្នន័យចាស់
    setTimeout(() => {
        cleanFirebaseData();
    }, 3000);
    
    // ... កូដដើម ...
});