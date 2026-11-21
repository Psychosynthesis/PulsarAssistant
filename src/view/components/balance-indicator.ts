import { Disposable } from "atom";
import type { ProviderBalance } from "../../provider-balance";
import { createElement } from "../utils";

export class BalanceIndicator {
  readonly element: HTMLButtonElement;
  private tooltipDisposable: Disposable | null = null;
  private balance: ProviderBalance | null = null;

  constructor(private readonly onRefresh: () => void) {
    this.element = createElement("button", {
      class: "pulsar-assistant-balance",
      style: { display: "none" },
    }) as HTMLButtonElement;
    this.element.type = "button";
    this.element.setAttribute("aria-label", "Provider balance");
    this.element.addEventListener("click", () => {
      this.onRefresh();
    });

    this.tooltipDisposable = atom.tooltips.add(this.element, {
      title: () =>
        this.balance
          ? `${this.balance.details}\nClick to refresh`
          : "Provider balance",
      placement: "bottom",
    });
  }

  setBalance(balance: ProviderBalance | null): void {
    this.balance = balance;
    if (!balance) {
      this.element.style.display = "none";
      this.element.textContent = "";
      this.element.classList.remove("is-unavailable");
      return;
    }
    this.element.textContent = `Баланс: ${balance.amountText}`;
    this.element.classList.toggle(
      "is-unavailable",
      balance.available === false,
    );
    this.element.style.display = "";
  }

  dispose(): void {
    this.tooltipDisposable?.dispose();
    this.tooltipDisposable = null;
  }
}
