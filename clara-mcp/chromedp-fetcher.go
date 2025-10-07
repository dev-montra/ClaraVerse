package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/chromedp"
)

// ChromeDPManager handles lightweight browser automation with chromedp
type ChromeDPManager struct {
	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.RWMutex
}

// NewChromeDPManager creates a new chromedp manager with a persistent browser context
func NewChromeDPManager() *ChromeDPManager {
	// Create a persistent browser context
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-web-security", true),
		chromedp.UserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
	)

	allocCtx, cancel := chromedp.NewExecAllocator(context.Background(), opts...)
	ctx, _ := chromedp.NewContext(allocCtx)

	return &ChromeDPManager{
		ctx:    ctx,
		cancel: cancel,
	}
}

// FetchContent fetches web content using chromedp with JavaScript execution
func (cm *ChromeDPManager) FetchContent(targetURL string, timeout time.Duration) (*WebContent, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if timeout == 0 {
		timeout = 10 * time.Second
	}

	// Create a timeout context for this specific request
	ctx, cancel := context.WithTimeout(cm.ctx, timeout)
	defer cancel()

	startTime := time.Now()

	var title, htmlContent string
	var description string

	// Navigate and wait for the page to load
	err := chromedp.Run(ctx,
		chromedp.Navigate(targetURL),
		// Wait for body to be present
		chromedp.WaitVisible("body", chromedp.ByQuery),
		// Wait a bit for JavaScript to execute
		chromedp.Sleep(2*time.Second),
		// Remove script and style tags
		chromedp.Evaluate(`
			document.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
		`, nil),
		// Get the title
		chromedp.Title(&title),
		// Get meta description
		chromedp.Evaluate(`
			(() => {
				const meta = document.querySelector('meta[name="description"]');
				return meta ? meta.getAttribute('content') : '';
			})()
		`, &description),
		// Extract text content from semantic elements
		chromedp.Evaluate(`
			(() => {
				const selectors = [
					'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
					'p', 'span', 'div', 'article', 'section', 'main',
					'li', 'td', 'th', 'blockquote', 'figcaption',
					'address', 'time', 'strong', 'b', 'em', 'i',
					'code', 'pre', 'cite', 'mark', 'a', 'button', 'label'
				];

				const seen = new Set();
				const content = [];

				selectors.forEach(selector => {
					document.querySelectorAll(selector).forEach(el => {
						const text = el.textContent.trim();
						if (text && text.length > 2 && !seen.has(text)) {
							// Filter out CSS-like content
							if (!text.includes('{') && !text.includes('rgba(') &&
								!text.includes('function(') && !text.startsWith('data-')) {
								seen.add(text);
								content.push(text);
							}
						}
					});
				});

				return content.join('\n');
			})()
		`, &htmlContent),
	)

	if err != nil {
		return nil, fmt.Errorf("chromedp navigation failed: %v", err)
	}

	return &WebContent{
		URL:             targetURL,
		Title:           title,
		Content:         htmlContent,
		Description:     description,
		StatusCode:      200,
		IsDynamic:       true,
		LoadingStrategy: "chromedp",
		LoadTime:        time.Since(startTime),
	}, nil
}

// Cleanup closes the browser context
func (cm *ChromeDPManager) Cleanup() {
	if cm.cancel != nil {
		cm.cancel()
	}
	log.Println("ChromeDPManager: Cleanup completed")
}

// GetCapabilities returns information about chromedp capabilities
func (cm *ChromeDPManager) GetCapabilities() map[string]interface{} {
	return map[string]interface{}{
		"is_available":         true,
		"javascript_execution": true,
		"screenshot_capture":   true,
		"implementation":       "chromedp",
		"startup_time":         "instant",
	}
}

// isValidContentText filters out CSS, JavaScript, and other non-content text
func isValidContentTextChrome(text string) bool {
	if len(text) <= 2 {
		return false
	}

	lowerText := strings.ToLower(text)

	// Filter out common non-content patterns
	invalidPatterns := []string{
		"function(", "var ", "let ", "const ", "return ",
		"document.", "window.", "console.",
		"data-", "aria-", "http://", "https://",
		".css", ".js", ".png", ".jpg",
		"color:", "background:", "border:",
		"@media", "@import",
	}

	for _, pattern := range invalidPatterns {
		if strings.Contains(lowerText, pattern) {
			return false
		}
	}

	// Filter out CSS blocks
	if strings.Contains(text, "{") && strings.Contains(text, "}") {
		return false
	}

	return true
}
