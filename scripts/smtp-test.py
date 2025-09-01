#!/usr/bin/env python3
"""
SMTP Testing Script for UltraZend Development
Tests SMTP server functionality and email delivery
"""

import smtplib
import socket
import json
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

class SMTPTester:
    def __init__(self, smtp_host='app', mx_port=25, submission_port=587):
        self.smtp_host = smtp_host
        self.mx_port = mx_port
        self.submission_port = submission_port
        self.results = []

    def log_result(self, test_name, success, details=None, error=None):
        """Log test result"""
        result = {
            'test': test_name,
            'success': success,
            'timestamp': datetime.now().isoformat(),
            'details': details,
            'error': str(error) if error else None
        }
        self.results.append(result)
        status = '✅ PASS' if success else '❌ FAIL'
        print(f"{status} {test_name}")
        if error:
            print(f"   Error: {error}")
        if details:
            print(f"   Details: {details}")

    def test_port_connectivity(self):
        """Test if SMTP ports are accessible"""
        for port_name, port in [('MX', self.mx_port), ('Submission', self.submission_port)]:
            try:
                sock = socket.create_connection((self.smtp_host, port), timeout=10)
                sock.close()
                self.log_result(f'{port_name} Port {port} Connectivity', True)
            except Exception as e:
                self.log_result(f'{port_name} Port {port} Connectivity', False, error=e)

    def test_smtp_banner(self):
        """Test SMTP banner response"""
        try:
            with smtplib.SMTP(self.smtp_host, self.mx_port, timeout=10) as server:
                response = server.ehlo()
                banner = response[1].decode('utf-8') if response[1] else 'No banner'
                self.log_result('SMTP Banner', True, details=f'Response: {banner}')
        except Exception as e:
            self.log_result('SMTP Banner', False, error=e)

    def test_ehlo_features(self):
        """Test EHLO features"""
        try:
            with smtplib.SMTP(self.smtp_host, self.mx_port, timeout=10) as server:
                response = server.ehlo()
                features = response[1].decode('utf-8').split('\n') if response[1] else []
                self.log_result('EHLO Features', True, details=f'Features: {features}')
        except Exception as e:
            self.log_result('EHLO Features', False, error=e)

    def test_submission_auth_required(self):
        """Test that submission port requires authentication"""
        try:
            with smtplib.SMTP(self.smtp_host, self.submission_port, timeout=10) as server:
                server.ehlo()
                try:
                    server.mail('test@example.com')
                    # If we get here without auth, it's a problem
                    self.log_result('Submission Auth Required', False, 
                                  error='Submission port allows mail without authentication')
                except smtplib.SMTPRecipientsRefused:
                    self.log_result('Submission Auth Required', True)
                except Exception as auth_error:
                    if 'authentication' in str(auth_error).lower():
                        self.log_result('Submission Auth Required', True)
                    else:
                        self.log_result('Submission Auth Required', False, error=auth_error)
        except Exception as e:
            self.log_result('Submission Auth Required', False, error=e)

    def test_mx_external_email(self):
        """Test MX server accepts external emails"""
        try:
            with smtplib.SMTP(self.smtp_host, self.mx_port, timeout=10) as server:
                server.ehlo()
                server.mail('external@example.com')
                server.rcpt('test@ultrazend.com.br')  # Should accept local domain
                server.quit()
                self.log_result('MX External Email Acceptance', True)
        except Exception as e:
            self.log_result('MX External Email Acceptance', False, error=e)

    def test_relay_protection(self):
        """Test that MX server blocks unauthorized relay"""
        try:
            with smtplib.SMTP(self.smtp_host, self.mx_port, timeout=10) as server:
                server.ehlo()
                server.mail('external@example.com')
                try:
                    server.rcpt('external@other-domain.com')  # Should be rejected
                    self.log_result('Relay Protection', False, 
                                  error='MX server allowed unauthorized relay')
                except smtplib.SMTPRecipientsRefused:
                    self.log_result('Relay Protection', True)
        except Exception as e:
            self.log_result('Relay Protection', False, error=e)

    def test_send_test_email(self):
        """Send a test email through MailHog"""
        try:
            # Connect to MailHog SMTP
            with smtplib.SMTP('mailhog', 1025, timeout=10) as server:
                msg = MIMEMultipart()
                msg['From'] = 'test@ultrazend.com.br'
                msg['To'] = 'recipient@example.com'
                msg['Subject'] = 'UltraZend SMTP Test'
                
                body = f"""
                This is a test email from UltraZend SMTP server.
                
                Test Details:
                - Timestamp: {datetime.now().isoformat()}
                - Test Type: Development SMTP Test
                - Server: UltraZend Development Environment
                
                If you receive this email, the SMTP system is working correctly.
                """
                
                msg.attach(MIMEText(body, 'plain'))
                server.send_message(msg)
                
                self.log_result('Send Test Email', True, 
                              details='Email sent to MailHog successfully')
        except Exception as e:
            self.log_result('Send Test Email', False, error=e)

    def test_connection_limits(self):
        """Test connection limits"""
        connections = []
        try:
            # Try to create multiple connections
            for i in range(5):
                conn = smtplib.SMTP(self.smtp_host, self.mx_port, timeout=5)
                connections.append(conn)
            
            self.log_result('Connection Limits', True, 
                          details=f'Created {len(connections)} concurrent connections')
        except Exception as e:
            self.log_result('Connection Limits', False, error=e)
        finally:
            # Clean up connections
            for conn in connections:
                try:
                    conn.quit()
                except:
                    pass

    def run_all_tests(self):
        """Run all SMTP tests"""
        print("🧪 Starting UltraZend SMTP Tests...")
        print("=" * 50)
        
        tests = [
            self.test_port_connectivity,
            self.test_smtp_banner,
            self.test_ehlo_features,
            self.test_submission_auth_required,
            self.test_mx_external_email,
            self.test_relay_protection,
            self.test_send_test_email,
            self.test_connection_limits
        ]
        
        for test in tests:
            try:
                test()
            except Exception as e:
                self.log_result(test.__name__, False, error=e)
            
            # Small delay between tests
            time.sleep(1)
        
        # Print summary
        print("\n" + "=" * 50)
        print("📊 Test Summary:")
        
        passed = sum(1 for r in self.results if r['success'])
        total = len(self.results)
        
        print(f"✅ Passed: {passed}/{total}")
        print(f"❌ Failed: {total - passed}/{total}")
        print(f"📊 Success Rate: {(passed/total)*100:.1f}%")
        
        # Save results to file
        with open('/tmp/smtp-test-results.json', 'w') as f:
            json.dump(self.results, f, indent=2)
        
        print("\n📄 Detailed results saved to: /tmp/smtp-test-results.json")
        
        return passed == total

if __name__ == '__main__':
    tester = SMTPTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed! SMTP server is working correctly.")
        exit(0)
    else:
        print("\n⚠️  Some tests failed. Check the logs for details.")
        exit(1)