package stripe

// import (
// 	"encoding/json"
// 	"io"
// 	"net/http"
// 	"os"

// 	"github.com/lsherman98/pb-template/pocketbase/collections"
// 	"github.com/pocketbase/pocketbase"
// 	"github.com/pocketbase/pocketbase/apis"
// 	"github.com/pocketbase/pocketbase/core"
// 	"github.com/stripe/stripe-go/v83"
// 	portal "github.com/stripe/stripe-go/v83/billingportal/session"
// 	checkout "github.com/stripe/stripe-go/v83/checkout/session"
// 	"github.com/stripe/stripe-go/v83/customer"
// 	"github.com/stripe/stripe-go/v83/webhook"
// )

// func Init(app *pocketbase.PocketBase) error {
// 	domain := "https://example.com"
// 	stripe.Key = os.Getenv("STRIPE_API_KEY")
// 	webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")

// 	dev := os.Getenv("DEV") == "true"
// 	if dev {
// 		domain = "http://localhost:5173"
// 	}

// 	stripeTest := os.Getenv("STRIPE_TEST") == "true"
// 	if stripeTest {
// 		stripe.Key = os.Getenv("TEST_STRIPE_API_KEY")
// 		webhookSecret = os.Getenv("TEST_STRIPE_WEBHOOK_SECRET")
// 	}

// 	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
// 		subscriptionsCollection, err := app.FindCollectionByNameOrId(collections.StripeSubscriptions)
// 		if err != nil {
// 			return err
// 		}

// 		chargesCollection, err := app.FindCollectionByNameOrId(collections.StripeCharges)
// 		if err != nil {
// 			return err
// 		}

// 		customersCollection, err := app.FindCollectionByNameOrId(collections.StripeCustomers)
// 		if err != nil {
// 			return err
// 		}

// 		se.Router.POST("/api/webhooks/stripe", func(e *core.RequestEvent) error {
// 			payload, err := io.ReadAll(e.Request.Body)
// 			if err != nil {
// 				return e.BadRequestError("failed to read request body", err)
// 			}

// 			event := stripe.Event{}
// 			if err := e.BindBody(&event); err != nil {
// 				return e.BadRequestError("failed to read stripe event", err)
// 			}

// 			signatureHeader := e.Request.Header.Get("Stripe-Signature")
// 			event, err = webhook.ConstructEvent(payload, signatureHeader, webhookSecret)
// 			if err != nil {
// 				return e.BadRequestError("failed to verify stripe event", err)
// 			}

// 			switch event.Type {
// 			case "customer.subscription.created":
// 				var subscription stripe.Subscription
// 				if err := json.Unmarshal(event.Data.Raw, &subscription); err != nil {
// 					return e.BadRequestError("failed to unmarshal customer.subscription.created event", err)
// 				}
// 				if err := updateSubscriptionRecord(e, subscription, subscriptionsCollection); err != nil {
// 					return e.BadRequestError("failed to update subscription record", err)
// 				}
// 			case "customer.subscription.updated":
// 				var subscription stripe.Subscription
// 				if err := json.Unmarshal(event.Data.Raw, &subscription); err != nil {
// 					return e.BadRequestError("failed to unmarshal customer.subscription.updated event", err)
// 				}
// 				if err := updateSubscriptionRecord(e, subscription, subscriptionsCollection); err != nil {
// 					return e.BadRequestError("failed to update subscription record", err)
// 				}
// 			case "customer.subscription.deleted":
// 				var subscription stripe.Subscription
// 				if err := json.Unmarshal(event.Data.Raw, &subscription); err != nil {
// 					return e.BadRequestError("failed to unmarshal customer.subscription.deleted event", err)
// 				}
// 				if err := updateSubscriptionRecord(e, subscription, subscriptionsCollection); err != nil {
// 					return e.BadRequestError("failed to update subscription record", err)
// 				}
// 			case "charge.succeeded":
// 				var charge stripe.Charge
// 				if err := json.Unmarshal(event.Data.Raw, &charge); err != nil {
// 					return e.BadRequestError("failed to unmarshal charge.succeeded event", err)
// 				}
// 				if err := handleChargeSucceeded(e, charge, chargesCollection); err != nil {
// 					return e.BadRequestError("failed to handle charge.succeeded", err)
// 				}
// 			case "checkout.session.completed":
// 				var session stripe.CheckoutSession
// 				if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
// 					return e.BadRequestError("failed to unmarshal checkout.session.completed event", err)
// 				}

// 				if err := handleCheckoutSessionCompleted(e, session, chargesCollection); err != nil {
// 					return e.BadRequestError("failed to handle checkout.session.completed", err)
// 				}
// 			default:
// 				return e.BadRequestError("unexpected stripe event type", nil)
// 			}

// 			e.Response.WriteHeader(http.StatusOK)
// 			return nil
// 		})

// 		se.Router.GET("/api/stripe/create-checkout-session", func(e *core.RequestEvent) error {
// 			user := e.Auth.Id
// 			email := e.Auth.Email()
// 			subscriptionType := e.Request.URL.Query().Get("subscriptionType")

// 			customerRecord, err := e.App.FindFirstRecordByData(customersCollection.Name, "user", user)
// 			if err != nil && customerRecord == nil {
// 				params := &stripe.CustomerParams{
// 					Email: stripe.String(email),
// 					Metadata: map[string]string{
// 						"pb_user": user,
// 					},
// 				}

// 				result, err := customer.New(params)
// 				if err != nil {
// 					return e.BadRequestError("failed to create customer", err)
// 				}

// 				customerRecord = core.NewRecord(customersCollection)
// 				customerRecord.Set("user", user)
// 				customerRecord.Set("customer_id", result.ID)
// 				customerRecord.Set("email", email)
// 				if err := app.Save(customerRecord); err != nil {
// 					return e.BadRequestError("failed to save customer record", err)
// 				}
// 			}

// 			var priceId string
// 			mode := stripe.CheckoutSessionModeSubscription

// 			switch subscriptionType {
// 			case "monthly":
// 			case "yearly":
// 			case "lifetime":
// 				mode = stripe.CheckoutSessionModePayment
// 			default:
// 				return e.BadRequestError("invalid product param", nil)
// 			}

// 			params := &stripe.CheckoutSessionParams{
// 				LineItems: []*stripe.CheckoutSessionLineItemParams{
// 					{
// 						Price:    stripe.String(priceId),
// 						Quantity: stripe.Int64(1),
// 					},
// 				},
// 				Mode:                stripe.String(string(mode)),
// 				SuccessURL:          stripe.String(domain + "/rules"),
// 				CancelURL:           stripe.String(domain + "/subscriptions"),
// 				Customer:            stripe.String(customerRecord.GetString("customer_id")),
// 				AllowPromotionCodes: stripe.Bool(true),
// 				Metadata: map[string]string{
// 					"price_id": priceId,
// 				},
// 			}

// 			s, err := checkout.New(params)
// 			if err != nil {
// 				e.App.Logger().Error("New checkout session", "error", err)
// 				return e.BadRequestError("failed to create checkout session", err)
// 			}

// 			e.JSON(http.StatusOK, map[string]string{"url": s.URL})
// 			return nil
// 		}).Bind(apis.RequireAuth())

// 		se.Router.GET("/api/stripe/create-portal-session", func(e *core.RequestEvent) error {
// 			userId := e.Auth.Id
// 			customer, err := e.App.FindFirstRecordByData(customersCollection.Name, "user", userId)
// 			if err != nil {
// 				return e.BadRequestError("failed to find customer", err)
// 			}

// 			params := &stripe.BillingPortalSessionParams{
// 				Customer:  stripe.String(customer.GetString("customer_id")),
// 				ReturnURL: stripe.String(domain + "/subscription"),
// 			}

// 			s, err := portal.New(params)
// 			if err != nil {
// 				e.App.Logger().Error("New billing portal session", "error", err)
// 				return e.BadRequestError("failed to create portal session", err)
// 			}

// 			e.JSON(http.StatusOK, map[string]string{"url": s.URL})
// 			return nil
// 		}).Bind(apis.RequireAuth())

// 		return se.Next()
// 	})

// 	return nil
// }

// func updateSubscriptionRecord(e *core.RequestEvent, subscription stripe.Subscription, subscriptionsCollection *core.Collection) error {
// 	var subscriptionRecord *core.Record
// 	subscriptionRecord, err := e.App.FindFirstRecordByData(collections.StripeSubscriptions, "customer_id", subscription.Customer.ID)
// 	if err != nil {
// 		e.App.Logger().Info("Stripe Hooks: creating new subscription record")
// 		subscriptionRecord = core.NewRecord(subscriptionsCollection)
// 	}

// 	customer, err := e.App.FindFirstRecordByData(collections.StripeCustomers, "customer_id", subscription.Customer.ID)
// 	if err != nil {
// 		e.App.Logger().Info("Stripe Hooks: failed to find customer record")
// 		return err
// 	}

// 	user, err := e.App.FindRecordById(collections.Users, customer.GetString("user"))
// 	if err != nil {
// 		e.App.Logger().Info("Stripe Hooks: failed to find user record")
// 	}

// 	if user == nil {
// 		e.App.Logger().Error("Stripe Hooks: user is nil, cannot update subscription")
// 		return nil
// 	}

// 	priceId := subscription.Items.Data[0].Price.ID
// 	cancelled := subscription.Status != stripe.SubscriptionStatusActive
// 	if cancelled {
// 		user.Set("tier", "free")
// 		if err := e.App.Save(user); err != nil {
// 			return err
// 		}
// 	} else {
// 		switch priceId {
// 		default:
// 		}

// 		if err := e.App.Save(user); err != nil {
// 			return err
// 		}
// 	}

// 	subscriptionRecord.Set("subscription_id", subscription.ID)
// 	subscriptionRecord.Set("user", customer.GetString("user"))
// 	subscriptionRecord.Set("customer_id", subscription.Customer.ID)
// 	subscriptionRecord.Set("metadata", subscription.Metadata)
// 	subscriptionRecord.Set("status", subscription.Status)
// 	subscriptionRecord.Set("cancel_at_period_end", subscription.CancelAtPeriodEnd)
// 	subscriptionRecord.Set("cancel_at", subscription.CancelAt)
// 	subscriptionRecord.Set("canceled_at", subscription.CanceledAt)
// 	subscriptionRecord.Set("current_period_start", subscription.Items.Data[0].CurrentPeriodStart)
// 	subscriptionRecord.Set("current_period_end", subscription.Items.Data[0].CurrentPeriodEnd)
// 	subscriptionRecord.Set("created", subscription.Created)
// 	subscriptionRecord.Set("ended_at", subscription.EndedAt)

// 	if err := e.App.Save(subscriptionRecord); err != nil {
// 		return err
// 	}

// 	return nil
// }

// func handleChargeSucceeded(e *core.RequestEvent, charge stripe.Charge, chargesCollection *core.Collection) error {
// 	user, err := e.App.FindFirstRecordByData(collections.StripeCustomers, "customer_id", charge.Customer.ID)
// 	if err != nil {
// 		return e.BadRequestError("failed to find customer", err)
// 	}

// 	chargeRecord := core.NewRecord(chargesCollection)
// 	chargeRecord.Set("charge_id", charge.ID)
// 	chargeRecord.Set("amount", charge.Amount)
// 	chargeRecord.Set("status", charge.Status)
// 	chargeRecord.Set("created", charge.Created)
// 	chargeRecord.Set("user", user.GetString("user"))
// 	chargeRecord.Set("customer_id", charge.Customer.ID)
// 	chargeRecord.Set("receipt_url", charge.ReceiptURL)
// 	chargeRecord.Set("metadata", charge.Metadata)
// 	chargeRecord.Set("paid", charge.Paid)
// 	chargeRecord.Set("refunded", charge.Refunded)
// 	if err := e.App.Save(chargeRecord); err != nil {
// 		return err
// 	}

// 	return nil
// }

// func handleCheckoutSessionCompleted(e *core.RequestEvent, session stripe.CheckoutSession, chargesCollection *core.Collection) error {
// 	lifetimePriceId := os.Getenv("STRIPE_LIFETIME_PRICE_ID")
// 	if os.Getenv("STRIPE_TEST") == "true" {
// 		lifetimePriceId = os.Getenv("TEST_STRIPE_LIFETIME_PRICE_ID")
// 	}

// 	priceId := session.Metadata["price_id"]

// 	customer, err := e.App.FindFirstRecordByData(collections.StripeCustomers, "customer_id", session.Customer.ID)
// 	if err != nil {
// 		return e.BadRequestError("failed to find customer", err)
// 	}

// 	user, err := e.App.FindRecordById(collections.Users, customer.GetString("user"))
// 	if err != nil {
// 		return e.BadRequestError("failed to find user", err)
// 	}

// 	switch priceId {
// 	case lifetimePriceId:
// 	default:
// 		return nil
// 	}

// 	if err := e.App.Save(user); err != nil {
// 		return err
// 	}

// 	return nil

// }
