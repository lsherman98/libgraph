package llama

// import (
// 	"bytes"
// 	"encoding/json"
// 	"fmt"
// 	"io"
// 	"log"
// 	"mime/multipart"
// 	"net/http"
// 	"os"
// 	"path/filepath"
// 	"strings"
// 	"time"
// )

// func main() {
// 	apiKey := "<your-api-key>" // See how to get your API key at https://developers.llamaindex.ai/python/cloud/general/api_key/
// 	filePath := "./my_file.pdf"

// 	jobID, err := uploadFile(apiKey, filePath)
// 	if err != nil {
// 		log.Fatal("Upload failed:", err)
// 	}

// 	fmt.Printf("File uploaded successfully. Job ID: %s\n", jobID)

// 	if err := pollForResult(apiKey, jobID); err != nil {
// 		log.Fatal("Polling failed:", err)
// 	}
// }

// func uploadFile(apiKey, filePath string) (string, error) {
// 	var body bytes.Buffer
// 	writer := multipart.NewWriter(&body)

// 	file, err := os.Open(filePath)
// 	if err != nil {
// 		return "", err
// 	}
// 	defer file.Close()

// 	part, err := writer.CreateFormFile("file", filepath.Base(filePath))
// 	if err != nil {
// 		return "", err
// 	}

// 	if _, err = io.Copy(part, file); err != nil {
// 		return "", err
// 	}

// 	// Configuration with structured options:
// 	// - Top-level options: tier, version, etc.
// 	// - input_options: Options specific to the input file type (html, spreadsheet, presentation, etc.)
// 	// - output_options: Control the output structure and markdown styling
// 	// - processing_options: Options for controlling how we process the document
// 	configurationJSON := `
// {
//     "tier": "cost_effective",
//     "version": "latest",
//     "languages": [
//       "en"
//     ],
//     "output_options": {,
//     "markdown": {
//       "annotate_links": true
//     },
//     "images_to_save": [
//       "embedded",
//       "screenshot"
//     ],
//     "export_pdf": {
//       "enable": true
//     },
//     },
//     "processing_options": {,
//     "ignore": {
//       "ignore_diagonal_text": true,
//       "ignore_text_in_image": true,
//       "ignore_hidden_text": true
//     },
//     }
// }
// `
// 	writer.WriteField("configuration", configurationJSON)

// 	if err = writer.Close(); err != nil {
// 		return "", err
// 	}

// 	req, err := http.NewRequest("POST", "https://api.cloud.llamaindex.ai/api/v2/parse/upload", &body)
// 	if err != nil {
// 		return "", err
// 	}

// 	req.Header.Set("Content-Type", writer.FormDataContentType())
// 	req.Header.Set("Authorization", "Bearer "+apiKey)

// 	client := &http.Client{}
// 	resp, err := client.Do(req)
// 	if err != nil {
// 		return "", err
// 	}
// 	defer resp.Body.Close()

// 	if resp.StatusCode != http.StatusOK {
// 		respBody, _ := io.ReadAll(resp.Body)
// 		return "", fmt.Errorf("upload failed: %s", string(respBody))
// 	}

// 	var result map[string]interface{}
// 	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
// 		return "", err
// 	}

// 	jobID, ok := result["id"].(string)
// 	if !ok {
// 		return "", fmt.Errorf("invalid response: missing job ID")
// 	}

// 	return jobID, nil
// }

// func pollForResult(apiKey, jobID string) error {
// 	url := fmt.Sprintf("https://api.cloud.llamaindex.ai/api/v2/parse/%s?expand=markdown", jobID)

// 	for {
// 		time.Sleep(5 * time.Second)

// 		req, err := http.NewRequest("GET", url, nil)
// 		if err != nil {
// 			return err
// 		}

// 		req.Header.Set("Authorization", "Bearer "+apiKey)

// 		client := &http.Client{}
// 		resp, err := client.Do(req)
// 		if err != nil {
// 			return err
// 		}

// 		if resp.StatusCode == http.StatusOK {
// 			var result map[string]interface{}
// 			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
// 				resp.Body.Close()
// 				return err
// 			}
// 			resp.Body.Close()

// 			// Check job status
// 			if jobData, ok := result["job"].(map[string]interface{}); ok {
// 				if status, ok := jobData["status"].(string); ok && status == "COMPLETED" {
// 					fmt.Println("Parsing completed!")

// 					// Access markdown result
// 					if markdownData, ok := result["markdown"].(map[string]interface{}); ok {
// 						if pages, ok := markdownData["pages"].([]interface{}); ok {
// 							var markdownParts []string
// 							for _, page := range pages {
// 								if pageMap, ok := page.(map[string]interface{}); ok {
// 									if pageMarkdown, ok := pageMap["markdown"].(string); ok {
// 										markdownParts = append(markdownParts, pageMarkdown)
// 									}
// 								}
// 							}
// 							if len(markdownParts) > 0 {
// 								fmt.Printf("Markdown result: %s\n", strings.Join(markdownParts, "\n\n"))
// 							}
// 						}
// 					}
// 				} else {
// 					statusStr := "Unknown"
// 					if status, ok := jobData["status"].(string); ok {
// 						statusStr = status
// 					}
// 					fmt.Printf("Job status: %s\n", statusStr)
// 				}
// 			} else {
// 				fmt.Printf("Result: %v\n", result)
// 			}
// 			break
// 		}

// 		if resp.StatusCode == http.StatusBadRequest {
// 			var errorResp map[string]interface{}
// 			if err := json.NewDecoder(resp.Body).Decode(&errorResp); err == nil {
// 				resp.Body.Close()
// 				if detail, ok := errorResp["detail"].(string); ok && detail == "Job not completed yet" {
// 					fmt.Println("Job still processing...")
// 					continue
// 				}
// 			}
// 		}

// 		respBody, _ := io.ReadAll(resp.Body)
// 		resp.Body.Close()
// 		return fmt.Errorf("error checking job status: %s", string(respBody))
// 	}

// 	return nil
// }

// func main() {

// 	url := "https://api.cloud.llamaindex.ai/api/v2/parse"
// 	method := "POST"

// 	payload := strings.NewReader(`{
//   "agentic_options": {
//     "custom_prompt": "string"
//   },
//   "client_name": "string",
//   "crop_box": {
//     "bottom": 0,
//     "left": 0,
//     "right": 0,
//     "top": 0
//   },
//   "disable_cache": true,
//   "fast_options": {},
//   "file_id": "string",
//   "http_proxy": "string",
//   "input_options": {
//     "html": {
//       "make_all_elements_visible": true,
//       "remove_fixed_elements": true,
//       "remove_navigation_elements": true
//     },
//     "pdf": {},
//     "presentation": {
//       "out_of_bounds_content": true,
//       "skip_embedded_data": true
//     },
//     "spreadsheet": {
//       "detect_sub_tables_in_sheets": true,
//       "force_formula_computation_in_sheets": true
//     }
//   },
//   "output_options": {
//     "export_pdf": {
//       "enable": true
//     },
//     "extract_printed_page_number": true,
//     "images_to_save": [
//       "screenshot"
//     ],
//     "markdown": {
//       "annotate_links": true,
//       "pages": {
//         "merge_tables_across_pages_in_markdown": true
//       },
//       "tables": {
//         "compact_markdown_tables": true,
//         "markdown_table_multiline_separator": "string",
//         "output_tables_as_markdown": true
//       }
//     },
//     "spatial_text": {
//       "do_not_unroll_columns": true,
//       "preserve_layout_alignment_across_pages": true,
//       "preserve_very_small_text": true
//     },
//     "tables_as_spreadsheet": {
//       "enable": true,
//       "guess_sheet_name": true
//     }
//   },
//   "page_ranges": {
//     "max_pages": 0,
//     "target_pages": "string"
//   },
//   "processing_control": {
//     "job_failure_conditions": {
//       "allowed_page_failure_ratio": 0,
//       "fail_on_buggy_font": true,
//       "fail_on_image_extraction_error": true,
//       "fail_on_image_ocr_error": true,
//       "fail_on_markdown_reconstruction_error": true
//     },
//     "timeouts": {
//       "base_in_seconds": 0,
//       "extra_time_per_page_in_seconds": 0
//     }
//   },
//   "processing_options": {
//     "aggressive_table_extraction": true,
//     "auto_mode_configuration": [
//       {
//         "filename_match_glob": "string",
//         "filename_match_glob_list": [
//           "string"
//         ],
//         "filename_regexp": "string",
//         "filename_regexp_mode": "string",
//         "full_page_image_in_page": true,
//         "full_page_image_in_page_threshold": 0,
//         "image_in_page": true,
//         "layout_element_in_page": "string",
//         "layout_element_in_page_confidence_threshold": 0,
//         "page_contains_at_least_n_charts": 0,
//         "page_contains_at_least_n_images": 0,
//         "page_contains_at_least_n_layout_elements": 0,
//         "page_contains_at_least_n_lines": 0,
//         "page_contains_at_least_n_links": 0,
//         "page_contains_at_least_n_numbers": 0,
//         "page_contains_at_least_n_percent_numbers": 0,
//         "page_contains_at_least_n_tables": 0,
//         "page_contains_at_least_n_words": 0,
//         "page_contains_at_most_n_charts": 0,
//         "page_contains_at_most_n_images": 0,
//         "page_contains_at_most_n_layout_elements": 0,
//         "page_contains_at_most_n_lines": 0,
//         "page_contains_at_most_n_links": 0,
//         "page_contains_at_most_n_numbers": 0,
//         "page_contains_at_most_n_percent_numbers": 0,
//         "page_contains_at_most_n_tables": 0,
//         "page_contains_at_most_n_words": 0,
//         "page_longer_than_n_chars": 0,
//         "page_md_error": true,
//         "page_shorter_than_n_chars": 0,
//         "parsing_conf": {
//           "adaptive_long_table": true,
//           "aggressive_table_extraction": true,
//           "crop_box": {
//             "bottom": 0,
//             "left": 0,
//             "right": 0,
//             "top": 0
//           },
//           "custom_prompt": "string",
//           "extract_layout": true,
//           "high_res_ocr": true,
//           "ignore": {
//             "ignore_diagonal_text": true,
//             "ignore_hidden_text": true
//           },
//           "language": "string",
//           "markdown": {
//             "merge_tables_across_pages_in_markdown": true
//           },
//           "outlined_table_extraction": true,
//           "presentation": {
//             "out_of_bounds_content": true,
//             "skip_embedded_data": true
//           },
//           "spatial_text": {
//             "do_not_unroll_columns": true,
//             "preserve_layout_alignment_across_pages": true,
//             "preserve_very_small_text": true
//           },
//           "tier": "fast",
//           "version": "2026-01-08"
//         },
//         "regexp_in_page": "string",
//         "regexp_in_page_mode": "string",
//         "table_in_page": true,
//         "text_in_page": "string",
//         "trigger_mode": "string"
//       }
//     ],
//     "disable_heuristics": true,
//     "ignore": {
//       "ignore_diagonal_text": true,
//       "ignore_hidden_text": true,
//       "ignore_text_in_image": true
//     },
//     "ocr_parameters": {
//       "languages": [
//         "af"
//       ]
//     },
//     "specialized_chart_parsing": "agentic"
//   },
//   "source_url": "string",
//   "tier": "fast",
//   "version": "2026-01-08",
//   "webhook_configurations": [
//     {
//       "webhook_events": [
//         "string"
//       ],
//       "webhook_headers": {},
//       "webhook_url": "string"
//     }
//   ]
// }`)

// 	client := &http.Client{}
// 	req, err := http.NewRequest(method, url, payload)

// 	if err != nil {
// 		fmt.Println(err)
// 		return
// 	}
// 	req.Header.Add("Content-Type", "application/json")
// 	req.Header.Add("Accept", "application/json")
// 	req.Header.Add("Authorization", "Bearer <token>")

// 	res, err := client.Do(req)
// 	if err != nil {
// 		fmt.Println(err)
// 		return
// 	}
// 	defer res.Body.Close()

// 	body, err := io.ReadAll(res.Body)
// 	if err != nil {
// 		fmt.Println(err)
// 		return
// 	}
// 	fmt.Println(string(body))
// }
