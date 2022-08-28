import React, { useCallback, useState } from "react";
import { Alert, Checkbox, Classes } from "@blueprintjs/core";
import createOverlayRender from "../util/createOverlayRender";
import createBlock from "../writes/createBlock";

type Props = {
  content: string;
  onConfirm?: () => void;
  confirmText?: string;
  onCancel?: (() => void) | true;
};

const SimpleAlert =
  ({
    onClose,
    content,
    onConfirm,
    onCancel,
    externalLink,
    confirmText = "Ok",
    dontShowAgain,
  }) => {
    const alertOnClose = useCallback(
      (confirmed) => {
        onClose();
        if (!confirmed && typeof onCancel === "function") onCancel();
      },
      [onCancel, onClose]
    );
    const cancelProps = onCancel
      ? {
          cancelButtonText: "Cancel",
          canOutsideClickCancel: true,
          canEscapeKeyCancel: true,
        }
      : {};
    const [checked, setChecked] = useState(false);
    const alerOnConfirm = useCallback(() => {
      (checked && dontShowAgain
        ? createBlock({
            parentUid: dontShowAgain,
            node: { text: "Do not show again" },
          })
        : Promise.resolve()
      ).then(onConfirm);
    }, [onConfirm, checked, dontShowAgain]);
    return (
      <Alert
        isOpen={true}
        onClose={alertOnClose}
        onConfirm={alerOnConfirm}
        confirmButtonText={confirmText}
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        autoFocus={false}
        {...cancelProps}
      >
        <div
          className={Classes.ALERT_CONTENTS}
          style={{ whiteSpace: "pre-wrap" }}
        >
          {content}
        </div>
      </Alert>
    );
  };

export const render = (props) =>
  (window.RoamLazy
    ? window.RoamLazy.MarkedReact()
    : import("marked-react").then((r) => r.default)
  ).then((Markdown) =>
    createOverlayRender<Props>("simple-alert", SimpleAlert(Markdown))(props)
  );

export default SimpleAlert;
