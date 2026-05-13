"""
SymCheck AI - Medical Triage System
Enhanced with user demographics and better emergency detection
"""

from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import json
import uuid
import requests
import re
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
import io
from flask import send_file
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')

app = Flask(__name__)
app.config['SECRET_KEY'] = 'dev-secret-key-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///symcheck.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# Ollama configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma2:2b"
CONFIDENCE_THRESHOLD = 85

active_sessions = {}

# ================================================================
# DATABASE MODELS - UPDATED with user demographics
# ================================================================

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    first_name = db.Column(db.String(50))
    last_name = db.Column(db.String(50))
    age = db.Column(db.Integer)
    gender = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    medical_histories = db.relationship('MedicalHistory', backref='user', lazy=True)

class MedicalHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    session_id = db.Column(db.String(100), nullable=False)
    symptoms = db.Column(db.Text, nullable=False)
    conversation = db.Column(db.Text)
    final_conditions = db.Column(db.Text)
    urgency = db.Column(db.String(50))
    confidence = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================================================================
# EMERGENCY KEYWORDS - Comprehensive list
# ================================================================

EMERGENCY_CONDITIONS = {
    "stroke": {
        "keywords": ["stroke", "face drooping", "arm weakness", "slurred speech", "sudden confusion", 
                    "trouble speaking", "sudden numbness", "face numb", "arm numb", "leg numb", 
                    "sudden vision", "trouble walking", "loss of balance", "severe headache sudden"],
        "diagnosis": "Possible Stroke - MEDICAL EMERGENCY",
        "actions": ["CALL 911 IMMEDIATELY", "Note the time symptoms started", "Do not drive", "Do not eat or drink"],
        "urgency": "EMERGENCY"
    },
    "heart_attack": {
        "keywords": ["chest pain", "chest pressure", "heart attack", "chest tightness", "pain spreading to arm",
                    "pain in jaw", "pain in back", "shortness of breath", "cold sweat", "nausea chest pain",
                    "indigestion chest", "lightheaded", "pain left arm", "pain right arm"],
        "diagnosis": "Possible Heart Attack - MEDICAL EMERGENCY",
        "actions": ["CALL 911 IMMEDIATELY", "Chew aspirin if not allergic", "Stop all activity", "Unlock door for paramedics"],
        "urgency": "EMERGENCY"
    }
}

def check_emergency(symptoms_text):
    """Check if symptoms indicate an emergency"""
    symptoms_lower = symptoms_text.lower()
    
    for condition, data in EMERGENCY_CONDITIONS.items():
        for keyword in data["keywords"]:
            if keyword in symptoms_lower:
                return {
                    "is_emergency": True,
                    "diagnosis": data["diagnosis"],
                    "actions": data["actions"],
                    "urgency": "EMERGENCY"
                }
    return {"is_emergency": False}

# ================================================================
# LLM FUNCTIONS
# ================================================================

def call_ollama(prompt):
    """Simple call to Ollama"""
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 500
                }
            },
            timeout=60
        )
        
        if response.status_code == 200:
            return response.json().get('response', '')
        else:
            print(f"Ollama error: {response.status_code}")
            return None
    except Exception as e:
        print(f"Connection error: {e}")
        return None

def analyze_symptoms(session_data, user_message):
    """Analyze symptoms using LLM with proper conversation tracking"""
    
    # Build conversation history
    conversation_text = ""
    for msg in session_data['conversation'][-8:]:
        conversation_text += f"{msg['role']}: {msg['content']}\n"
    
    symptoms = session_data.get('symptoms', user_message)
    if not session_data.get('symptoms'):
        session_data['symptoms'] = user_message
    
    # Track what we've already asked
    questions_asked = session_data.get('questions_asked', [])
    exchange_count = len([m for m in session_data['conversation'] if m['role'] == 'user'])
    
    # Check if we already have a diagnosis in progress
    if exchange_count < 2:
        # Early stage - need more info
        followup_prompt = f"""The patient has these symptoms: {symptoms}

You act as a doctor. Your role play starts as soon as you reply. You are responsible for successfully diagnosing this problem.
Get this one hint, plus another, so think of question to get as much info as possible.  

Ask ONE specific follow-up question to understand better. Ask about:
- When symptoms started (sudden or gradual)
- Severity on scale 1-10
- What makes it better or worse
- Location and radiation of symptoms

Just ask ONE question naturally, so you can prompt the user to give you more context so you may better diagnose, nothing else.

Your question:"""
        
        response = call_ollama(followup_prompt)
        
        if response and len(response) > 5:
            question = response.strip()
        else:
            question = "How long have you had these symptoms and how severe are they on a scale of 1-10?"
        
        # Track that we asked this
        session_data['questions_asked'] = questions_asked + [question[:50]]
        
        return {
            "diagnosis_ready": False,
            "confidence": 30 + (exchange_count * 15),
            "response_text": question
        }
    
    else:
        # Have enough info - provide diagnosis using SAME format that worked before
        diagnosis_prompt = f"""Patient symptoms: {symptoms}

Full conversation history:
{conversation_text}

Based on this information, provide a medical assessment.

IMPORTANT: Respond with EXACTLY these 5 lines in this format:

DIAGNOSIS: [one sentence diagnosis based on symptoms]
CONFIDENCE: [number between 85-95]
URGENCY: [EMERGENCY, URGENT, or NON-URGENT]
REMEDIES: [3 short remedies separated by commas]
ACTIONS: [3 short actions separated by commas]

Example response:
DIAGNOSIS: Lower back muscle strain from overuse
CONFIDENCE: 90
URGENCY: NON-URGENT
REMEDIES: Apply ice for 15 minutes, Rest for 2 days, Gentle stretching
ACTIONS: Avoid heavy lifting, See doctor if persists over 1 week, Use proper posture

Now provide assessment for this patient:"""
        
        response = call_ollama(diagnosis_prompt)
        
        # Parse the response - SAME PARSING LOGIC that worked before
        if response and len(response) > 20:
            diagnosis_match = re.search(r'DIAGNOSIS:\s*(.+?)(?=\n|$)', response, re.IGNORECASE)
            confidence_match = re.search(r'CONFIDENCE:\s*(\d+)', response)
            urgency_match = re.search(r'URGENCY:\s*(\w+)', response, re.IGNORECASE)
            remedies_match = re.search(r'REMEDIES:\s*(.+?)(?=\n[A-Z]|\n\n|$)', response, re.IGNORECASE | re.DOTALL)
            actions_match = re.search(r'ACTIONS:\s*(.+?)(?=\n\n|$)', response, re.IGNORECASE | re.DOTALL)
            
            if diagnosis_match and confidence_match and urgency_match:
                diagnosis = diagnosis_match.group(1).strip()
                confidence = int(confidence_match.group(1))
                urgency = urgency_match.group(1).upper()
                
                remedies = ["Rest", "Ice/heat", "Gentle movement"]
                if remedies_match:
                    remedies = [r.strip() for r in remedies_match.group(1).split(',')][:3]
                
                actions = ["Monitor symptoms", "Rest 2-3 days", "See doctor if worsens"]
                if actions_match:
                    actions = [a.strip() for a in actions_match.group(1).split(',')][:3]
                
                return {
                    "diagnosis_ready": True,
                    "confidence": min(confidence, 80),
                    "possible_diagnosis": diagnosis,
                    "urgency": urgency,
                    "home_remedies": remedies,
                    "recommended_actions": actions,
                    "red_flags": []
                }
        
        # Fallback for common conditions (only if LLM fails)
        #symptom_lower = symptoms.lower()
        #if "sore throat" in symptom_lower or "stuffy" in symptom_lower:
         #   return {
          #      "diagnosis_ready": True,
           #     "confidence": 90,
            #    "possible_diagnosis": "Upper Respiratory Infection (Common Cold)",
             #   "urgency": "NON-URGENT",
              #  "home_remedies": ["Rest and hydrate", "Warm salt water gargle", "Steam inhalation"],
               # "recommended_actions": ["Get plenty of rest", "Use OTC cold medication", "See doctor if fever >101°F"],
                #"red_flags": []
            #}
        #elif "neck" in symptom_lower:
         #   return {
          #      "diagnosis_ready": True,
           #     "confidence": 90,
            #    "possible_diagnosis": "Acute neck muscle strain",
             #   "urgency": "NON-URGENT",
              #  "home_remedies": ["Apply ice for 15 minutes", "Gentle neck stretches", "Use proper posture"],
               # "recommended_actions": ["Rest from aggravating activities", "Take OTC anti-inflammatory if safe", "See doctor if numbness develops"],
                #"red_flags": []
            #}
        #else:
         #   return {
          #      "diagnosis_ready": True,
           #     "confidence": 85,
            #    "possible_diagnosis": "Musculoskeletal strain",
             #   "urgency": "NON-URGENT",
              #  "home_remedies": ["Rest affected area", "Apply ice or heat", "Gentle movement"],
               # "recommended_actions": ["Monitor symptoms", "Rest for 2-3 days", "See doctor if worsens"],
                #"red_flags": []
            #}
# ================================================================
# AUTHENTICATION ROUTES
# ================================================================

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

@app.route('/')
def index():
    return redirect(url_for('login'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        first_name = request.form.get('first_name', '')
        last_name = request.form.get('last_name', '')
        age = request.form.get('age', '')
        gender = request.form.get('gender', '')
        
        if User.query.filter_by(email=email).first():
            flash('Email already registered.')
            return redirect(url_for('register'))
        
        hashed = generate_password_hash(password)
        user = User(
            email=email, 
            password_hash=hashed,
            first_name=first_name,
            last_name=last_name,
            age=int(age) if age else None,
            gender=gender
        )
        db.session.add(user)
        db.session.commit()
        
        login_user(user)
        flash('Registration successful!')
        return redirect(url_for('dashboard'))
    
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        
        user = User.query.filter_by(email=email).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            return redirect(url_for('dashboard'))
        
        flash('Invalid email or password.')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    histories = MedicalHistory.query.filter_by(user_id=current_user.id).order_by(MedicalHistory.created_at.desc()).all()
    
    # Parse diagnosis names for display
    for history in histories:
        try:
            if history.final_conditions:
                conditions = json.loads(history.final_conditions)
                history.diagnosis_name = conditions[0].get('name', 'Unknown') if conditions else 'Unknown'
            else:
                history.diagnosis_name = 'Unknown'
        except:
            history.diagnosis_name = 'Unknown'
    
    return render_template('dashboard.html', histories=histories)

@app.route('/chat')
@login_required
def chat():
    session_id = str(uuid.uuid4())
    active_sessions[session_id] = {
        'conversation': [],
        'symptoms': ''
    }
    return render_template('chat.html', session_id=session_id)

# ================================================================
# API ROUTES
# ================================================================

@app.route('/api/analyze', methods=['POST'])
@login_required
def analyze():
    data = request.get_json()
    user_message = data.get('message', '')
    session_id = data.get('session_id', '')
    
    # Create session if needed
    if session_id not in active_sessions:
        session_id = str(uuid.uuid4())
        active_sessions[session_id] = {
            'conversation': [],
            'symptoms': user_message
        }
    
    session_data = active_sessions[session_id]
    
    # Add user message
    session_data['conversation'].append({'role': 'user', 'content': user_message})
    
    # Get analysis
    analysis = analyze_symptoms(session_data, user_message)
    
    if analysis.get('diagnosis_ready'):
        confidence = analysis['confidence']
        
        response_text = f"""
⚠️ **NOT MEDICAL ADVICE - FOR INFORMATIONAL PURPOSES ONLY**

**🏥 Assessment Complete** (Confidence: {confidence}%)

**📋 Possible Diagnosis:** {analysis.get('possible_diagnosis', 'Unknown')}

**🚨 Urgency:** {analysis.get('urgency', 'NON-URGENT')}

"""
        if analysis.get('red_flags'):
            response_text += "**⚠️ RED FLAGS DETECTED:**\n"
            for flag in analysis['red_flags']:
                response_text += f"• {flag}\n"
            response_text += "\n"
        
        if analysis.get('home_remedies'):
            response_text += "**🏠 Home Care Suggestions:**\n"
            for remedy in analysis['home_remedies']:
                response_text += f"• {remedy}\n"
            response_text += "\n"
        
        if analysis.get('recommended_actions'):
            response_text += "**📋 Recommended Actions:**\n"
            for action in analysis['recommended_actions']:
                response_text += f"• {action}\n"
            response_text += "\n"
        
        if analysis.get('urgency') == 'EMERGENCY':
            response_text = "🚨 **MEDICAL EMERGENCY DETECTED** 🚨\n\n" + response_text
        
        response_text += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👨‍⚕️ *Always consult a healthcare professional for medical concerns.*"
        
        # Save to database
        history = MedicalHistory(
            user_id=current_user.id,
            session_id=session_id,
            symptoms=session_data['symptoms'][:500],
            conversation=json.dumps(session_data['conversation']),
            final_conditions=json.dumps([{'name': analysis.get('possible_diagnosis', 'Unknown'), 'confidence': confidence}]),
            urgency=analysis.get('urgency', 'NON-URGENT'),
            confidence=confidence
        )
        db.session.add(history)
        db.session.commit()
        
        # Clean up session
        if session_id in active_sessions:
            del active_sessions[session_id]
        
        ai_response = response_text
        assessment_ready = True
    else:
        ai_response = f"⚠️ NOT MEDICAL ADVICE - {analysis.get('response_text', 'Can you tell me more?')}"
        assessment_ready = False
    
    session_data['conversation'].append({'role': 'bot', 'content': ai_response})
    
    return jsonify({
        'response': ai_response,
        'confidence': analysis.get('confidence', 0) if assessment_ready else 0,
        'urgency': analysis.get('urgency', '') if assessment_ready else '',
        'assessment_ready': assessment_ready,
        'session_id': session_id
    })

@app.route('/api/download-pdf/<int:history_id>')
@login_required
def download_pdf(history_id):
    """Generate and download PDF diagnosis report"""
    history = MedicalHistory.query.get_or_404(history_id)
    
    # Verify ownership
    if history.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    # Create PDF buffer
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a5f7a'),
        spaceAfter=30
    )
    story.append(Paragraph("SymCheck AI - Medical Assessment Report", title_style))
    
    # Patient info
    story.append(Paragraph(f"Patient: {current_user.first_name} {current_user.last_name}", styles['Normal']))
    story.append(Paragraph(f"Age: {current_user.age} | Gender: {current_user.gender}", styles['Normal']))
    story.append(Paragraph(f"Date: {history.created_at.strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    story.append(Spacer(1, 20))
    
    # Symptoms
    story.append(Paragraph("Symptoms", styles['Heading2']))
    story.append(Paragraph(history.symptoms, styles['Normal']))
    story.append(Spacer(1, 15))
    
    # Diagnosis
    try:
        conditions = json.loads(history.final_conditions)
        story.append(Paragraph("Diagnosis", styles['Heading2']))
        for condition in conditions:
            story.append(Paragraph(f"• {condition.get('name', 'Unknown')} (Confidence: {condition.get('confidence', 0)}%)", styles['Normal']))
    except:
        story.append(Paragraph("Diagnosis information not available", styles['Normal']))
    story.append(Spacer(1, 15))
    
    # Urgency
    urgency_color = colors.red if history.urgency == 'EMERGENCY' else (colors.orange if history.urgency == 'URGENT' else colors.green)
    urgency_style = ParagraphStyle(
        'Urgency',
        parent=styles['Normal'],
        textColor=urgency_color,
        fontSize=14,
        fontName='Helvetica-Bold'
    )
    story.append(Paragraph(f"Urgency Level: {history.urgency}", urgency_style))
    story.append(Spacer(1, 15))
    
    # Disclaimer
    disclaimer_style = ParagraphStyle(
        'Disclaimer',
        parent=styles['Normal'],
        textColor=colors.grey,
        fontSize=9,
        alignment=1
    )
    story.append(Paragraph("⚠️ NOT MEDICAL ADVICE - FOR INFORMATIONAL PURPOSES ONLY", disclaimer_style))
    story.append(Paragraph("Always consult a healthcare professional for medical concerns.", disclaimer_style))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    
    return send_file(
        buffer,
        as_attachment=True,
        download_name=f"symcheck_report_{history_id}.pdf",
        mimetype='application/pdf'
    )

@app.route('/api/dashboard-stats')
@login_required
def dashboard_stats():
    """Get statistics for dashboard charts"""
    histories = MedicalHistory.query.filter_by(user_id=current_user.id).order_by(MedicalHistory.created_at.asc()).all()
    
    urgency_counts = {'EMERGENCY': 0, 'URGENT': 0, 'NON-URGENT': 0}
    
    for h in histories:
        if h.urgency == 'EMERGENCY':
            urgency_counts['EMERGENCY'] += 1
        elif h.urgency == 'URGENT':
            urgency_counts['URGENT'] += 1
        else:
            urgency_counts['NON-URGENT'] += 1
    
    confidence_data = []
    dates = []
    
    for h in histories:
        if h.confidence:
            confidence_data.append(h.confidence)
            dates.append(h.created_at.strftime('%m/%d'))
    
    return jsonify({
        'urgency_counts': urgency_counts,
        'confidence_trend': {'dates': dates, 'values': confidence_data},
        'total_assessments': len(histories)
    })

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    
    print("=" * 60)
    print("🩺 SymCheck AI - Medical Triage System")
    print("=" * 60)
    print(f"\n📍 http://127.0.0.1:5000")
    print(f"🤖 Model: {MODEL_NAME}")
    print(f"✅ Emergency detection: Stroke, Heart Attack")
    print(f"✅ User demographics: Age, Gender")
    
    test_response = call_ollama("Say 'OK' if you're working")
    if test_response:
        print(f"✅ Ollama connected!")
    else:
        print(f"❌ Ollama not responding - run 'ollama serve' in another terminal")
    
    print("\n⚠️ NOT MEDICAL ADVICE - For educational purposes only")
    print("\nPress Ctrl+C to stop\n")
    
    app.run(debug=True, port=5000)