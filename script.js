// --- Firebase Setup ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, updateDoc, doc, deleteDoc, // <--- تم إضافة deleteDoc
    enableIndexedDbPersistence, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDHHMxl6dCUID3sMmqTaib8eo_xN01icUI",
    authDomain: "ljoij-7becb.firebaseapp.com",
    projectId: "ljoij-7becb",
    storageBucket: "ljoij-7becb.firebasestorage.app",
    messagingSenderId: "33082484922",
    appId: "1:33082484922:web:182660e3823541f7887a83",
    measurementId: "G-09E3THXZ0K"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable Offline Persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
    } else if (err.code == 'unimplemented') {
        console.log('The current browser does not support all of the features required to enable persistence');
    }
});

// --- State Variables ---
let customers = [];
let invoices = [];
let privacy = true;

// --- DOM Elements & Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // UI Events
    document.getElementById('pin-code').addEventListener('input', checkPin);
    document.getElementById('fingerprint-btn').addEventListener('click', showLockMsg);
    document.getElementById('eye-icon').addEventListener('click', togglePrivacy);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.target, item));
    });
    document.getElementById('go-to-register').addEventListener('click', () => {
        switchTab('register-section', document.querySelector('[data-target="register-section"]'));
    });

    // Inputs
    document.getElementById('inv-total').addEventListener('input', calculateInvoice);
    document.getElementById('inv-paid').addEventListener('input', calculateInvoice);
    document.getElementById('pay-cust-select').addEventListener('change', calculateCustomerTotal);

    // Actions
    document.getElementById('btn-add-customer').addEventListener('click', addCustomer);
    document.getElementById('btn-save-invoice').addEventListener('click', saveInvoice);
    document.getElementById('btn-process-payment').addEventListener('click', processPayment);

    // --- NEW: Delete Button Listener (Event Delegation) ---
    // هذا الكود الجديد المسؤول عن تشغيل زر الحذف
    document.getElementById('cust-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('fa-trash')) {
            const id = e.target.getAttribute('data-id');
            deleteCustomer(id);
        }
    });

    // Initial Load
    startListeners();
});

// --- Real-time Data Listeners ---
function startListeners() {
    const custRef = query(collection(db, "customers"), orderBy("createdAt", "desc")); // ترتيب حسب الأحدث
    const invRef = query(collection(db, "invoices"), orderBy("date", "desc"));

    onSnapshot(custRef, (snapshot) => {
        customers = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderCustomers();
        updatePaySelect();
        updateUI();
    });

    onSnapshot(invRef, (snapshot) => {
        invoices = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderDebts();
        updateUI();
        if(document.getElementById('pay-cust-select').value) calculateCustomerTotal();
    });
}

// --- Logic Functions ---

function checkPin() {
    if(document.getElementById('pin-code').value === '1010') {
        document.getElementById('lock-screen').style.transform = 'translateY(-100%)';
    }
}

function showLockMsg() {
    let m = document.getElementById('lock-msg'); 
    m.style.opacity = 1; 
    setTimeout(()=>m.style.opacity=0, 2000);
}

function switchTab(id, el) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');
    
    let map = {'home-section':'الرئيسية', 'register-section':'سجل الديون', 'invoice-section':'بيع جديد', 'customer-section':'الزبائن'};
    document.getElementById('page-title').innerText = "مكتب أضواء كربلاء - " + (map[id] || '');

    if(id === 'register-section') updatePaySelect();
}

function togglePrivacy() {
    privacy = !privacy;
    updateUI();
    document.getElementById('eye-icon').className = privacy ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
}

// --- Invoice Logic ---
function calculateInvoice() {
    let total = parseFloat(document.getElementById('inv-total').value) || 0;
    let paid = parseFloat(document.getElementById('inv-paid').value) || 0;
    document.getElementById('inv-remaining').value = total - paid;
}

async function saveInvoice() {
    let custId = document.getElementById('inv-cust-select').value;
    let item = document.getElementById('inv-item').value;
    let total = parseFloat(document.getElementById('inv-total').value);
    let paid = parseFloat(document.getElementById('inv-paid').value) || 0;
    let remaining = parseFloat(document.getElementById('inv-remaining').value);

    if(!custId || !item || isNaN(total)) return alert("يرجى إكمال البيانات");

    let cust = customers.find(c => c.id == custId);

    try {
        await addDoc(collection(db, "invoices"), {
            cName: cust.name,
            cId: custId,
            item: item,
            total: total,
            paid: paid,
            remaining: remaining,
            date: new Date().toISOString(),
            displayDate: new Date().toLocaleDateString('ar-IQ')
        });
        
        alert("تم الحفظ!");
        document.getElementById('inv-item').value = "";
        document.getElementById('inv-total').value = "";
        document.getElementById('inv-paid').value = "";
        document.getElementById('inv-remaining').value = "";
        switchTab('register-section', document.querySelector('[data-target="register-section"]'));
    } catch (e) {
        console.error("Error adding document: ", e);
        alert("حدث خطأ في الحفظ");
    }
}

// --- Payment Logic ---
function updatePaySelect() {
    let select = document.getElementById('pay-cust-select');
    let currentVal = select.value;
    select.innerHTML = '<option value="">اختر الزبون...</option>';
    
    let indebtedNames = [...new Set(invoices.filter(i => i.remaining > 0).map(i => i.cName))];
    
    customers.forEach(c => {
        if(indebtedNames.includes(c.name)) {
            let opt = document.createElement('option'); 
            opt.value = c.id; 
            opt.innerText = c.name; 
            select.appendChild(opt);
        }
    });
    select.value = currentVal;
}

function calculateCustomerTotal() {
    let custId = document.getElementById('pay-cust-select').value;
    let display = document.getElementById('cust-total-debt');
    
    if(!custId) { 
        display.innerText = "0 $"; 
        renderDebts(); 
        return; 
    }

    let customer = customers.find(c => c.id == custId);
    let total = invoices
        .filter(i => i.cName === customer.name)
        .reduce((sum, inv) => sum + inv.remaining, 0);
    
    display.innerText = total + " $";
    renderDebts(customer.name);
}

async function processPayment() {
    let custId = document.getElementById('pay-cust-select').value;
    let amount = parseFloat(document.getElementById('pay-amount').value);
    
    if(!custId || !amount || amount <= 0) return alert("خطأ في المبلغ أو الزبون");

    let customer = customers.find(c => c.id == custId);
    let customerInvoices = invoices.filter(inv => inv.cName === customer.name && inv.remaining > 0);
    
    if(customerInvoices.length === 0) return alert("لا توجد ديون");

    let remainingToPay = amount;
    let batchPromises = [];

    for (let inv of customerInvoices) {
        if (remainingToPay <= 0) break;

        let deduct = Math.min(inv.remaining, remainingToPay);
        let newRemaining = inv.remaining - deduct;
        let newPaid = inv.paid + deduct;

        const invRef = doc(db, "invoices", inv.id);
        batchPromises.push(updateDoc(invRef, {
            remaining: newRemaining,
            paid: newPaid
        }));

        remainingToPay -= deduct;
    }

    try {
        await Promise.all(batchPromises);
        alert("تم التسديد بنجاح");
        document.getElementById('pay-amount').value = "";
    } catch(e) {
        alert("خطأ في التحديث");
    }
}

function renderDebts(filterName = "") {
    let container = document.getElementById('debts-container');
    container.innerHTML = "";
    
    let filtered = invoices.filter(inv => inv.remaining > 0);
    if(filterName) filtered = filtered.filter(inv => inv.cName === filterName);

    if(filtered.length === 0) container.innerHTML = "<p style='text-align:center; color:#999;'>لا توجد ديون</p>";

    filtered.forEach(inv => {
        container.innerHTML += `
            <div class="debt-item">
                <div class="debt-info">
                    <h4>${inv.cName}</h4>
                    <small>${inv.item} | ${inv.displayDate || inv.date}</small>
                </div>
                <div class="debt-amount">
                    ${inv.remaining} $
                    <div style="font-size:0.7rem; color:#607d8b; font-weight:normal;">من أصل: ${inv.total}</div>
                </div>
            </div>
        `;
    });
}

// --- Customer Logic (تم التعديل) ---
async function addCustomer() {
    let name = document.getElementById('new-cust-name').value;
    let phone = document.getElementById('new-cust-phone').value;
    if(!name) return;

    try {
        await addDoc(collection(db, "customers"), {
            name: name,
            phone: phone,
            createdAt: serverTimestamp()
        });
        alert("تمت إضافة الزبون");
        document.getElementById('new-cust-name').value = "";
        document.getElementById('new-cust-phone').value = "";
    } catch (e) {
        alert("خطأ في الإضافة");
    }
}

// دالة الحذف الجديدة
async function deleteCustomer(id) {
    if(confirm("هل أنت متأكد من حذف هذا الزبون نهائياً؟")) {
        try {
            await deleteDoc(doc(db, "customers", id));
            alert("تم الحذف بنجاح");
        } catch (e) {
            console.error(e);
            alert("حدث خطأ أثناء الحذف");
        }
    }
}

function renderCustomers() {
    let sel = document.getElementById('inv-cust-select');
    let list = document.getElementById('cust-list');
    
    let currentSel = sel.value;
    
    sel.innerHTML = '<option value="">اختر الزبون...</option>';
    list.innerHTML = '';
    
    customers.forEach(c => {
        // إضافة للاختيار
        let opt = document.createElement('option'); 
        opt.value = c.id; 
        opt.innerText = c.name; 
        sel.appendChild(opt);
        
        // إضافة للقائمة مع زر الحذف
        list.innerHTML += `
        <div style="padding:15px; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center;">
            <div>
                <b style="font-size:1.1rem;">${c.name}</b>
                <div style="font-size:0.85rem; color:#666;">${c.phone}</div>
            </div>
            <i class="fa-solid fa-trash" data-id="${c.id}" style="color:#ef5350; cursor:pointer; font-size:1.2rem; padding:10px;"></i>
        </div>`;
    });
    
    sel.value = currentSel;
}

// --- UI Updates ---
function updateUI() {
    document.getElementById('total-customers').innerText = customers.length;
    document.getElementById('total-debts-count').innerText = invoices.filter(i => i.remaining > 0).length;
    
    let totalDebt = invoices.reduce((acc, curr) => acc + curr.remaining, 0);
    document.getElementById('hidden-debt').innerText = privacy ? "******" : totalDebt + " $";
    
    let cloudIcon = document.getElementById('cloud-status');
    if(cloudIcon) cloudIcon.style.color = navigator.onLine ? "white" : "orange";
}

window.addEventListener('online', updateUI);
window.addEventListener('offline', updateUI);
