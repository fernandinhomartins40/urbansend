import { JSDOM } from 'jsdom';
import { sanitizeHtml } from '../middleware/validation';

/**
 * Teste de compatibilidade para jsdom 24.1.0
 * Valida funcionalidades críticas após downgrade de 26.1.0 -> 24.1.0
 */
describe('JSDOM Compatibility Tests - Version 24.1.0', () => {
  
  test('should create JSDOM instance successfully', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
    expect(dom.window).toBeDefined();
    expect(dom.window.document).toBeDefined();
  });

  test('should handle basic DOM manipulation', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="test"></div></body></html>');
    const document = dom.window.document;
    
    const element = document.getElementById('test');
    expect(element).toBeTruthy();
    
    if (element) {
      element.innerHTML = '<p>Test content</p>';
      expect(element.innerHTML).toBe('<p>Test content</p>');
    }
  });

  test('should support HTML sanitization with DOMPurify', () => {
    const maliciousHtml = '<script>alert("xss")</script><p>Safe content</p>';
    const sanitized = sanitizeHtml(maliciousHtml);
    
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('<p>Safe content</p>');
  });

  test('should handle complex HTML structures', () => {
    const complexHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <div class="container">
            <h1>Title</h1>
            <p>Paragraph with <strong>bold</strong> text</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </div>
        </body>
      </html>
    `;
    
    const dom = new JSDOM(complexHtml);
    const document = dom.window.document;
    
    expect(document.title).toBe('Test');
    expect(document.querySelector('h1')?.textContent).toBe('Title');
    expect(document.querySelectorAll('li')).toHaveLength(2);
  });

  test('should support CSS selectors', () => {
    const html = `
      <div class="parent">
        <div class="child" data-test="value1">Child 1</div>
        <div class="child" data-test="value2">Child 2</div>
        <span class="other">Other element</span>
      </div>
    `;
    
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
    const document = dom.window.document;
    
    expect(document.querySelector('.parent')).toBeTruthy();
    expect(document.querySelectorAll('.child')).toHaveLength(2);
    expect(document.querySelector('[data-test="value1"]')?.textContent).toBe('Child 1');
  });

  test('should handle window and global objects', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://example.com',
      pretendToBeVisual: true,
      resources: 'usable'
    });
    
    expect(dom.window.location.href).toBe('https://example.com/');
    expect(dom.window.navigator).toBeDefined();
    expect(dom.window.console).toBeDefined();
  });

  test('should support event handling', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><button id="btn">Click me</button></body></html>');
    const document = dom.window.document;
    
    let clicked = false;
    const button = document.getElementById('btn');
    
    if (button) {
      button.addEventListener('click', () => {
        clicked = true;
      });
      
      // Simulate click
      const event = new dom.window.Event('click');
      button.dispatchEvent(event);
    }
    
    expect(clicked).toBe(true);
  });

  test('should handle form elements', () => {
    const formHtml = `
      <form id="testForm">
        <input type="text" name="username" value="testuser" />
        <input type="email" name="email" value="test@example.com" />
        <select name="country">
          <option value="br" selected>Brazil</option>
          <option value="us">USA</option>
        </select>
        <textarea name="message">Test message</textarea>
      </form>
    `;
    
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${formHtml}</body></html>`);
    const document = dom.window.document;
    
    const form = document.getElementById('testForm') as HTMLFormElement;
    expect(form).toBeTruthy();
    
    if (form) {
      const formData = new dom.window.FormData(form);
      expect(formData.get('username')).toBe('testuser');
      expect(formData.get('email')).toBe('test@example.com');
      expect(formData.get('country')).toBe('br');
      expect(formData.get('message')).toBe('Test message');
    }
  });

  test('should handle text content manipulation', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="content">Original content</div></body></html>');
    const document = dom.window.document;
    
    const element = document.getElementById('content');
    expect(element?.textContent).toBe('Original content');
    
    if (element) {
      element.textContent = 'Updated content';
      expect(element.textContent).toBe('Updated content');
      expect(element.innerHTML).toBe('Updated content');
    }
  });

  test('should support innerHTML with security considerations', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
    const document = dom.window.document;
    
    const container = document.getElementById('container');
    if (container) {
      // Test basic HTML insertion
      container.innerHTML = '<p>Safe <strong>HTML</strong> content</p>';
      expect(container.innerHTML).toBe('<p>Safe <strong>HTML</strong> content</p>');
      
      // Verify sanitization is needed for user content (via our sanitizeHtml function)
      const userContent = '<img src="x" onerror="alert(1)">';
      const sanitized = sanitizeHtml(userContent);
      container.innerHTML = sanitized;
      
      // Should not contain the onerror attribute
      expect(container.innerHTML).not.toContain('onerror');
    }
  });
});