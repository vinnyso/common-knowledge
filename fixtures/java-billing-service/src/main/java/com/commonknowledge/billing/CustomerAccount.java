package com.commonknowledge.billing;

import java.util.Objects;

public record CustomerAccount(String accountId, String billingEmail) {
  public CustomerAccount {
    Objects.requireNonNull(accountId, "accountId");
    Objects.requireNonNull(billingEmail, "billingEmail");
  }
}
