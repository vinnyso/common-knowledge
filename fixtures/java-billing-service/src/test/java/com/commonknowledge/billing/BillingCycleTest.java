package com.commonknowledge.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.TimeZone;
import org.junit.jupiter.api.Test;

class BillingCycleTest {
  @Test
  void sameInstantProducesTheSameCloseDateAcrossEnvironments() {
    CustomerAccount customer = new CustomerAccount("acct-1042", "billing@example.test");
    Instant instant = Instant.parse("2025-01-01T00:30:00Z");
    Clock clock = Clock.fixed(instant, ZoneId.of("UTC"));
    TimeZone original = TimeZone.getDefault();

    try {
      TimeZone.setDefault(TimeZone.getTimeZone(ZoneId.of("UTC")));
      Invoice utcInvoice = new BillingCycle(clock).createMonthlyInvoice(customer, BigDecimal.TEN);

      TimeZone.setDefault(TimeZone.getTimeZone(ZoneId.of("America/Los_Angeles")));
      Invoice pacificInvoice = new BillingCycle(clock).createMonthlyInvoice(customer, BigDecimal.TEN);

      assertEquals(utcInvoice.closeDate(), pacificInvoice.closeDate());
    } finally {
      TimeZone.setDefault(original);
    }
  }
}
